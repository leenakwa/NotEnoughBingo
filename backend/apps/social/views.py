from __future__ import annotations

from django.db.models import BooleanField, Exists, OuterRef, Prefetch, Value
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.bingos.models import Bingo
from apps.bingos.serializers import BingoCardSerializer
from apps.common.pagination import StandardPageNumberPagination
from apps.social.models import Comment, CommentLike
from apps.social.serializers import (
    CommentCreateSerializer,
    CommentSerializer,
    CommentUpdateSerializer,
)
from apps.social.services import (
    create_comment,
    like_bingo,
    like_comment,
    soft_delete_comment,
    unlike_bingo,
    unlike_comment,
)


def _with_like_state(queryset, request):
    if request.user.is_authenticated:
        return queryset.annotate(
            _is_liked=Exists(
                CommentLike.objects.filter(
                    user=request.user,
                    comment_id=OuterRef("pk"),
                )
            )
        )
    return queryset.annotate(_is_liked=Value(False, output_field=BooleanField()))


def accessible_bingo(request, public_id):
    bingo = get_object_or_404(
        Bingo.objects.select_related("author", "current_revision"),
        public_id=public_id,
        deleted_at__isnull=True,
    )
    is_owner = request.user.is_authenticated and bingo.author_id == request.user.pk
    if bingo.hidden_at and not is_owner:
        raise NotFound()
    if bingo.status != Bingo.Status.PUBLISHED and not is_owner:
        raise NotFound()
    if bingo.visibility == Bingo.Visibility.PRIVATE and not is_owner:
        raise NotFound()
    return bingo


class BingoLikeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=None,
        responses={200: BingoCardSerializer, 201: BingoCardSerializer},
    )
    def post(self, request, bingo_id):
        bingo = accessible_bingo(request, bingo_id)
        created = like_bingo(user=request.user, bingo=bingo)
        bingo.refresh_from_db()
        return Response(
            BingoCardSerializer(bingo, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(request=None, responses=BingoCardSerializer)
    def delete(self, request, bingo_id):
        bingo = accessible_bingo(request, bingo_id)
        unlike_bingo(user=request.user, bingo=bingo)
        bingo.refresh_from_db()
        return Response(
            BingoCardSerializer(bingo, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


@extend_schema_view(
    get=extend_schema(responses=CommentSerializer(many=True)),
    post=extend_schema(request=CommentCreateSerializer, responses={201: CommentSerializer}),
)
class CommentListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comments"
    serializer_class = CommentSerializer
    pagination_class = StandardPageNumberPagination

    def get_throttles(self):
        if self.request.method == "POST":
            return super().get_throttles()
        return []

    def get_bingo(self):
        if not hasattr(self, "_bingo"):
            self._bingo = accessible_bingo(self.request, self.kwargs["bingo_id"])
        return self._bingo

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Comment.objects.none()
        visible_replies = _with_like_state(
            Comment.objects.filter(hidden_at__isnull=True, parent__isnull=False)
            .select_related("author", "author__profile")
            .prefetch_related("author__profile__avatar__derivatives")
            .order_by("created_at"),
            self.request,
        )[:5]
        return _with_like_state(
            Comment.objects.filter(bingo=self.get_bingo(), parent__isnull=True)
            .select_related("author", "author__profile")
            .prefetch_related("author__profile__avatar__derivatives")
            .prefetch_related(
                Prefetch(
                    "replies",
                    queryset=visible_replies,
                    to_attr="prefetched_visible_replies",
                )
            ),
            self.request,
        )

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise PermissionDenied("Sign in to comment.")
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent = None
        if serializer.validated_data.get("parent_id"):
            parent = get_object_or_404(
                Comment,
                public_id=serializer.validated_data["parent_id"],
                bingo=self.get_bingo(),
                parent__isnull=True,
            )
            if parent.deleted_at or parent.hidden_at:
                raise PermissionDenied("This comment cannot receive replies.")
        comment = create_comment(
            user=request.user,
            bingo=self.get_bingo(),
            body=serializer.validated_data["body"],
            parent=parent,
        )
        return Response(
            CommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(responses=CommentSerializer(many=True)),
    post=extend_schema(request=CommentCreateSerializer, responses={201: CommentSerializer}),
)
class CommentReplyListCreateView(CommentListCreateView):
    def get_parent(self):
        if not hasattr(self, "_parent"):
            self._parent = get_object_or_404(
                Comment.objects.select_related("bingo"),
                public_id=self.kwargs["comment_id"],
                parent__isnull=True,
            )
            accessible_bingo(self.request, self._parent.bingo.public_id)
        return self._parent

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Comment.objects.none()
        return _with_like_state(
            Comment.objects.filter(parent=self.get_parent())
            .select_related("author", "author__profile")
            .prefetch_related("author__profile__avatar__derivatives")
            .order_by("created_at"),
            self.request,
        )

    def get_bingo(self):
        return self.get_parent().bingo

    def create(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise PermissionDenied("Sign in to reply.")
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if self.get_parent().deleted_at or self.get_parent().hidden_at:
            raise PermissionDenied("This comment cannot receive replies.")
        comment = create_comment(
            user=request.user,
            bingo=self.get_bingo(),
            body=serializer.validated_data["body"],
            parent=self.get_parent(),
        )
        return Response(
            CommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CommentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, comment_id):
        comment = get_object_or_404(
            Comment.objects.select_related("bingo", "author"),
            public_id=comment_id,
        )
        accessible_bingo(request, comment.bingo.public_id)
        if comment.author_id != request.user.pk:
            raise PermissionDenied("You can only modify your own comment.")
        return comment

    @extend_schema(request=CommentUpdateSerializer, responses=CommentSerializer)
    def patch(self, request, comment_id):
        comment = self.get_object(request, comment_id)
        serializer = CommentUpdateSerializer(comment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CommentSerializer(comment, context={"request": request}).data)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, comment_id):
        soft_delete_comment(user=request.user, comment=self.get_object(request, comment_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentLikeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_comment(self, request, comment_id):
        comment = get_object_or_404(
            Comment.objects.select_related("bingo", "author"),
            public_id=comment_id,
            hidden_at__isnull=True,
            deleted_at__isnull=True,
        )
        accessible_bingo(request, comment.bingo.public_id)
        return comment

    @extend_schema(
        request=None,
        responses={
            201: inline_serializer(
                name="CommentLikeResponse",
                fields={"liked": serializers.BooleanField()},
            )
        },
    )
    def post(self, request, comment_id):
        like_comment(user=request.user, comment=self.get_comment(request, comment_id))
        return Response({"liked": True}, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, comment_id):
        unlike_comment(user=request.user, comment=self.get_comment(request, comment_id))
        return Response(status=status.HTTP_204_NO_CONTENT)
