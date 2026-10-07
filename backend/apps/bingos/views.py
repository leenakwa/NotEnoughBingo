from __future__ import annotations

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import (
    BigIntegerField,
    Count,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Prefetch,
    Q,
)
from django.db.models.functions import Lower
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.bingos.exceptions import DraftPreconditionRequired
from apps.bingos.languages import requested_languages
from apps.bingos.models import Bingo, BingoRevision, BingoTag, Draft, Tag
from apps.bingos.serializers import (
    PUBLIC_SITEMAP_BUCKET_SIZE,
    PUBLIC_SITEMAP_MAX_PARTS,
    PUBLIC_SITEMAP_MAX_PK,
    AuthorSuggestionQuerySerializer,
    AuthorSuggestionSerializer,
    BingoCardSerializer,
    BingoCreateSerializer,
    BingoDetailSerializer,
    BingoDocumentInputSerializer,
    BingoRevisionSerializer,
    DraftDocumentInputSerializer,
    DraftSerializer,
    DraftWriteSerializer,
    PublicSitemapIndexSerializer,
    PublicSitemapQuerySerializer,
    PublicSitemapSerializer,
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
PUBLIC_SITEMAP_BINGO_LIMIT = PUBLIC_SITEMAP_BUCKET_SIZE


class AuthorSuggestionPagination(StandardPageNumberPagination):
    page_size = 10
    max_page_size = 10


class PublicSitemapIndexView(APIView):
    """List only occupied public buckets, including gaps without empty sitemap files."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=PublicSitemapIndexSerializer)
    def get(self, request):
        if request.query_params:
            raise ValidationError({"query": "This endpoint does not accept query parameters."})
        # PostgreSQL divides these bigint/integer operands exactly, without a float
        # conversion that would lose precision for IDs near BigAutoField's limit.
        parts = list(
            Bingo.objects.public_catalog()
            .annotate(
                sitemap_part=ExpressionWrapper(
                    (F("pk") - 1) / PUBLIC_SITEMAP_BUCKET_SIZE,
                    output_field=BigIntegerField(),
                )
            )
            .order_by("sitemap_part")
            .values_list("sitemap_part", flat=True)
            .distinct()[: PUBLIC_SITEMAP_MAX_PARTS + 1]
        )
        if len(parts) > PUBLIC_SITEMAP_MAX_PARTS:
            return Response(
                {"detail": "Sitemap index capacity exceeded; additional indexes are required."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                headers={"Cache-Control": "no-store", "Retry-After": "300"},
            )
        return Response(
            PublicSitemapIndexSerializer({"parts": [str(part) for part in parts]}).data,
            headers={"Cache-Control": "no-store"},
        )


class PublicSitemapView(APIView):
    """Expose an index-only public projection without hydrating card revisions."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(parameters=[PublicSitemapQuerySerializer], responses=PublicSitemapSerializer)
    def get(self, request):
        if set(request.query_params) - {"part"} or len(request.query_params.getlist("part")) > 1:
            raise ValidationError({"query": "Only one optional part parameter is supported."})
        # QueryDict uses HTML-form semantics, which skip blank optional fields.
        # A plain mapping preserves an explicitly blank part for validation.
        query = PublicSitemapQuerySerializer(data=request.query_params.dict())
        query.is_valid(raise_exception=True)
        part = query.validated_data.get("part")
        queryset = Bingo.objects.public_catalog()
        if part is None:
            # Keep the legacy response for frontends deployed before the index API.
            queryset = queryset.order_by("-last_published_at", "-pk")
        else:
            start = int(part) * PUBLIC_SITEMAP_BUCKET_SIZE + 1
            end = min(start + PUBLIC_SITEMAP_BUCKET_SIZE - 1, PUBLIC_SITEMAP_MAX_PK)
            queryset = queryset.filter(pk__gte=start, pk__lte=end).order_by("pk")
        rows = list(
            queryset.values_list(
                "public_id",
                "author__username",
                "last_published_at",
                "published_at",
            )[: PUBLIC_SITEMAP_BINGO_LIMIT + 1]
        )
        truncated = len(rows) > PUBLIC_SITEMAP_BINGO_LIMIT
        results = [
            {
                "bingo_id": public_id,
                "author_username": author_username,
                "last_modified": last_published_at or published_at,
            }
            for public_id, author_username, last_published_at, published_at in rows[
                :PUBLIC_SITEMAP_BINGO_LIMIT
            ]
        ]
        if part is not None and truncated:
            return Response(
                {"detail": "Sitemap bucket capacity exceeded."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                headers={"Cache-Control": "no-store", "Retry-After": "300"},
            )
        return Response(
            PublicSitemapSerializer({"results": results, "truncated": truncated}).data,
            headers={"Cache-Control": "no-store"},
        )


@extend_schema_view(
    get=extend_schema(
        parameters=[AuthorSuggestionQuerySerializer],
        description=(
            "Suggest active authors who currently have at least one bingo in the public catalog."
        ),
    )
)
class AuthorSuggestionListView(generics.ListAPIView):
    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]
    filter_backends: list = []
    serializer_class = AuthorSuggestionSerializer
    pagination_class = AuthorSuggestionPagination

    def get_queryset(self):
        query = AuthorSuggestionQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        search = query.validated_data.get("search", "")
        queryset = (
            User.objects.filter(
                is_active=True,
                suspended_at__isnull=True,
                deleted_at__isnull=True,
            )
            .select_related("profile")
            .annotate(
                has_public_bingo=Exists(
                    Bingo.objects.public_catalog().filter(author_id=OuterRef("pk"))
                )
            )
            .filter(has_public_bingo=True)
        )
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) | Q(profile__display_name__icontains=search)
            )
        return queryset.order_by(Lower("username"), "pk")


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
        "current_revision__background__derivatives",
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
                description=(
                    "Repeat for each matching tag name or slug, up to 15 values "
                    "of 50 characters each."
                ),
            ),
            OpenApiParameter(
                name="mine",
                type=bool,
                description="For an authenticated viewer, return their own live bingos.",
            ),
            OpenApiParameter(
                name="languages",
                type=str,
                many=True,
                style="form",
                explode=True,
                description="Repeat for each bingo language. Use all for no language filter.",
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
            mine = self.request.query_params.get("mine")
            if mine not in (None, "true", "false"):
                raise ValidationError({"mine": "Choose true or false."})
            if mine == "true" and not self.request.user.is_authenticated:
                raise NotAuthenticated()
            if mine == "true":
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
        if len(search) > 80:
            raise ValidationError({"search": "Must be at most 80 characters."})
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(author__username__icontains=search)
                | Q(author__profile__display_name__icontains=search)
            )
        author = params.get("author", "").strip()
        if len(author) > 80:
            raise ValidationError({"author": "Must be at most 80 characters."})
        if author:
            queryset = queryset.filter(
                Q(author__username__icontains=author)
                | Q(author__profile__display_name__icontains=author)
            )
        tags = [item.strip() for item in params.getlist("tags") if item.strip()]
        if len(tags) > 15:
            raise ValidationError({"tags": "Choose at most 15 tags."})
        if any(len(tag) > 50 for tag in tags):
            raise ValidationError({"tags": "Each tag must be at most 50 characters."})
        for tag in tags:
            queryset = queryset.filter(
                Q(tag_links__tag__slug__iexact=tag) | Q(tag_links__tag__name__iexact=tag)
            )
        languages = requested_languages(params)
        if languages:
            queryset = queryset.filter(language__in=languages)
        ordering = params.get("ordering", "")
        if ordering not in ("", "newest", "popular"):
            raise ValidationError({"ordering": "Choose newest or popular."})
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


class DraftListView(mixins.ListModelMixin, generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DraftSerializer
    pagination_class = StandardPageNumberPagination
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Draft.objects.none()
        return (
            Draft.objects.filter(
                bingo__author=self.request.user,
                bingo__deleted_at__isnull=True,
            )
            .select_related("bingo", "based_on_revision")
            .order_by("-updated_at", "-pk")
        )

    @extend_schema(
        responses=DraftSerializer(many=True),
        parameters=[
            OpenApiParameter(
                name="page_size",
                type=int,
                default=24,
                description="Requested page size; values above 100 are capped at 100.",
            )
        ],
    )
    def get(self, request):
        return self.list(request)

    @extend_schema(
        request=BingoDocumentInputSerializer,
        parameters=[
            OpenApiParameter(
                name="Idempotency-Key",
                location=OpenApiParameter.HEADER,
                required=True,
                type={"type": "string", "minLength": 8, "maxLength": 128},
                pattern=VALID_KEY.pattern,
                description="Letters, digits, dots, colons, underscores or hyphens.",
            ),
            OpenApiParameter(
                name="Idempotency-Replayed",
                location=OpenApiParameter.HEADER,
                type=str,
                enum=["true"],
                response=[201],
                description="Present when an identical request returns its recorded response.",
            ),
        ],
        responses={
            201: OpenApiResponse(
                DraftSerializer,
                description="Created draft, or the recorded draft response for an identical retry.",
            ),
            400: OpenApiResponse(
                OpenApiTypes.OBJECT,
                description="Invalid document or missing/malformed idempotency key.",
            ),
            409: OpenApiResponse(
                OpenApiTypes.OBJECT,
                description="Key used for a different request, or original request is processing.",
            ),
        },
    )
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

    @extend_schema(
        request=None,
        parameters=[
            OpenApiParameter(
                name="Idempotency-Key",
                location=OpenApiParameter.HEADER,
                required=True,
                type={"type": "string", "minLength": 8, "maxLength": 128},
                pattern=VALID_KEY.pattern,
                description="Letters, digits, dots, colons, underscores or hyphens.",
            )
        ],
        responses={
            201: OpenApiResponse(
                BingoDetailSerializer,
                description="Published board. Reusing the key returns without creating a revision.",
            ),
            400: OpenApiResponse(
                OpenApiTypes.OBJECT,
                description="Invalid draft or missing/malformed idempotency key.",
            ),
            409: OpenApiResponse(
                OpenApiTypes.OBJECT,
                description="The existing publication idempotency record conflicts.",
            ),
        },
    )
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


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter(
                name="page_size",
                type=int,
                default=24,
                description="Requested page size; values above 100 are capped at 100.",
            )
        ]
    )
)
class BingoRevisionListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BingoRevisionSerializer
    pagination_class = StandardPageNumberPagination
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BingoRevision.objects.none()
        bingo = get_object_or_404(Bingo, public_id=self.kwargs["bingo_id"])
        if bingo.author_id != self.request.user.pk and not self.request.user.has_perm(
            "moderation.view_private_content"
        ):
            raise PermissionDenied()
        return bingo.revisions.prefetch_related("cells__image", "revision_tags").order_by(
            "-revision_number", "-pk"
        )


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
