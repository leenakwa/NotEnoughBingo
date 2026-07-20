from __future__ import annotations

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bingos.exceptions import DraftPreconditionRequired
from apps.bingos.models import Bingo, BingoRevision, BingoTag, Draft, Tag
from apps.bingos.serializers import (
    BingoCardSerializer,
    BingoCreateSerializer,
    BingoDetailSerializer,
    BingoDocumentInputSerializer,
    BingoRevisionSerializer,
    DraftDocumentInputSerializer,
    DraftSerializer,
    DraftWriteSerializer,
    TagSerializer,
)
from apps.bingos.services import (
    archive_bingo,
    publish_bingo,
    restore_bingo,
    save_draft,
    soft_delete_bingo,
)
from apps.common.idempotency import VALID_KEY, execute_idempotent
from apps.common.pagination import StandardPageNumberPagination
from apps.common.permissions import IsVerifiedUser

ETAG_PATTERN = re.compile(r'^(?:W/)?"draft-(\d+)"$')


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter(
                name="search",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Case-insensitive tag name or slug search.",
            )
        ]
    )
)
class TagListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = TagSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        search = self.request.query_params.get("search", "").strip()
        if len(search) > 80:
            raise ValidationError({"search": "Must be at most 80 characters."})

        queryset = (
            Tag.objects.filter(hidden_at__isnull=True)
            .annotate(
                public_usage_count=Count(
                    "bingo_links",
                    filter=Q(bingo_links__bingo__in=Bingo.objects.public_catalog()),
                    distinct=True,
                )
            )
            .filter(public_usage_count__gt=0)
        )
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        return queryset.order_by("-public_usage_count", "name")


def _optimized_bingos(queryset):
    return queryset.select_related(
        "author",
        "author__profile",
        "cover",
        "background",
        "current_revision",
        "current_revision__cover",
        "current_revision__background",
        "draft",
    ).prefetch_related(
        Prefetch("tag_links", queryset=BingoTag.objects.select_related("tag").order_by("position")),
        "current_revision__cells__image",
        "current_revision__cells__image__derivatives",
        "current_revision__revision_tags",
        "cover__derivatives",
        "background__derivatives",
        "author__profile__avatar__derivatives",
    )


def _expected_draft_version(request) -> int:
    raw = request.headers.get("If-Match", "")
    match = ETAG_PATTERN.fullmatch(raw.strip())
    if not match:
        body_version = request.data.get("version") if isinstance(request.data, dict) else None
        if (
            isinstance(body_version, int)
            and not isinstance(body_version, bool)
            and body_version >= 1
        ):
            return body_version
        raise DraftPreconditionRequired()
    return int(match.group(1))


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter(
                name="search",
                type=str,
                description="Case-insensitive title, username, or display-name search.",
            ),
            OpenApiParameter(
                name="author",
                type=str,
                description="Case-insensitive author username or display-name filter.",
            ),
            OpenApiParameter(
                name="tags",
                type=str,
                many=True,
                style="form",
                explode=True,
                description="Repeat for every tag name or slug that must match.",
            ),
            OpenApiParameter(
                name="mine",
                type=bool,
                description="For an authenticated viewer, return their own live bingos.",
            ),
            OpenApiParameter(
                name="ordering",
                type=str,
                enum=("newest", "popular"),
                default="newest",
            ),
        ]
    )
)
class BingoViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    lookup_field = "public_id"
    lookup_url_kwarg = "bingo_id"
    search_fields = ("title", "author__username", "author__profile__display_name")
    ordering_fields = ("published_at", "created_at", "like_count", "trending_score")
    ordering = ("-published_at", "-pk")
    pagination_class = StandardPageNumberPagination
    filter_backends: list = []

    def get_permissions(self):
        if self.action == "create":
            return [IsVerifiedUser()]
        if self.action == "destroy":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Bingo.objects.none()
        if self.action == "list":
            mine = self.request.query_params.get("mine") == "true"
            if mine and self.request.user.is_authenticated:
                queryset = Bingo.objects.live().filter(author=self.request.user)
            else:
                queryset = Bingo.objects.public_catalog()
        else:
            queryset = Bingo.objects.accessible_to(self.request.user)
        queryset = _optimized_bingos(queryset)
        if self.request.user.is_authenticated:
            from apps.social.models import BingoLike

            queryset = queryset.prefetch_related(
                Prefetch(
                    "likes",
                    queryset=BingoLike.objects.filter(user=self.request.user),
                    to_attr="_viewer_likes",
                )
            )
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        params = self.request.query_params
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(author__username__icontains=search)
                | Q(author__profile__display_name__icontains=search)
            )
        author = params.get("author", "").strip()
        if author:
            queryset = queryset.filter(
                Q(author__username__icontains=author)
                | Q(author__profile__display_name__icontains=author)
            )
        for tag in [item.strip() for item in params.getlist("tags") if item.strip()]:
            queryset = queryset.filter(
                Q(tag_links__tag__slug__iexact=tag) | Q(tag_links__tag__name__iexact=tag)
            )
        ordering = params.get("ordering", "")
        if ordering == "newest":
            queryset = queryset.order_by("-published_at", "-pk")
        elif ordering == "popular":
            queryset = queryset.order_by("-trending_score", "-published_at", "-pk")
        else:
            queryset = queryset.order_by("-published_at", "-pk")
        return queryset.distinct()

    def get_serializer_class(self):
        if self.action == "create":
            return BingoCreateSerializer
        if self.action == "list":
            return BingoCardSerializer
        return BingoDetailSerializer

    @extend_schema(request=BingoDocumentInputSerializer, responses={201: BingoDetailSerializer})
    def create(self, request, *args, **kwargs):
        serializer = BingoCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        bingo = serializer.save()
        bingo = _optimized_bingos(Bingo.objects.all()).get(pk=bingo.pk)
        return Response(
            BingoDetailSerializer(bingo, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        bingo = self.get_object()
        if bingo.author_id != request.user.pk:
            raise PermissionDenied()
        soft_delete_bingo(bingo=bingo, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DraftListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=DraftSerializer(many=True))
    def get(self, request):
        drafts = Draft.objects.filter(
            bingo__author=request.user,
            bingo__deleted_at__isnull=True,
        ).select_related("bingo", "based_on_revision")
        return Response(DraftSerializer(drafts, many=True).data)

    @extend_schema(request=BingoDocumentInputSerializer, responses={201: DraftSerializer})
    def post(self, request):
        if not request.user.can_create_content:
            raise PermissionDenied("A verified, active account is required.")
        serializer = BingoCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        def operation():
            bingo = serializer.save()
            draft = Draft.objects.select_related("bingo").get(bingo=bingo)
            return Response(
                DraftSerializer(draft, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )

        return execute_idempotent(request, operation)


class BingoDraftView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _bingo(self, request, bingo_id):
        return get_object_or_404(
            Bingo.objects.live().select_related("draft"),
            public_id=bingo_id,
            author=request.user,
        )

    @extend_schema(responses=DraftSerializer)
    def get(self, request, bingo_id):
        bingo = self._bingo(request, bingo_id)
        serializer = DraftSerializer(bingo.draft)
        return Response(serializer.data, headers={"ETag": serializer.data["etag"]})

    @extend_schema(request=DraftDocumentInputSerializer, responses=DraftSerializer)
    def put(self, request, bingo_id):
        if not request.user.can_create_content:
            raise PermissionDenied("A verified, active account is required.")
        bingo = self._bingo(request, bingo_id)
        serializer = DraftWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            draft = save_draft(
                bingo=bingo,
                actor=request.user,
                document=serializer.validated_data["document"],
                expected_version=_expected_draft_version(request),
            )
        except DjangoValidationError as exc:
            details = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise ValidationError(details) from exc
        output = DraftSerializer(draft)
        return Response(output.data, headers={"ETag": output.data["etag"]})


class BingoPublishView(APIView):
    permission_classes = [IsVerifiedUser]

    @extend_schema(request=None, responses={201: BingoDetailSerializer})
    def post(self, request, bingo_id):
        bingo = get_object_or_404(
            Bingo.objects.live(),
            public_id=bingo_id,
            author=request.user,
        )
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not VALID_KEY.fullmatch(idempotency_key):
            raise ValidationError(
                {
                    "idempotency_key": (
                        "Use 8-128 letters, digits, dots, colons, underscores or hyphens."
                    )
                }
            )
        try:
            revision = publish_bingo(
                bingo=bingo,
                actor=request.user,
                idempotency_key=idempotency_key,
            )
        except DjangoValidationError as exc:
            details = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise ValidationError(details) from exc
        revision = BingoRevision.objects.prefetch_related(
            "cells__image",
            "revision_tags",
        ).get(pk=revision.pk)
        published = _optimized_bingos(Bingo.objects.all()).get(pk=revision.bingo_id)
        return Response(
            BingoDetailSerializer(published, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class BingoRevisionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=BingoRevisionSerializer(many=True))
    def get(self, request, bingo_id):
        bingo = get_object_or_404(Bingo, public_id=bingo_id)
        if bingo.author_id != request.user.pk and not request.user.has_perm(
            "moderation.view_private_content"
        ):
            raise PermissionDenied()
        revisions = bingo.revisions.prefetch_related("cells__image", "revision_tags")
        return Response(BingoRevisionSerializer(revisions, many=True).data)


class BingoArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=BingoDetailSerializer)
    def post(self, request, bingo_id):
        bingo = get_object_or_404(Bingo.objects.live(), public_id=bingo_id, author=request.user)
        bingo = archive_bingo(bingo=bingo, actor=request.user)
        return Response(BingoDetailSerializer(bingo, context={"request": request}).data)


class BingoRestoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=BingoDetailSerializer)
    def post(self, request, bingo_id):
        bingo = get_object_or_404(Bingo.objects.live(), public_id=bingo_id, author=request.user)
        bingo = restore_bingo(bingo=bingo, actor=request.user)
        return Response(BingoDetailSerializer(bingo, context={"request": request}).data)
