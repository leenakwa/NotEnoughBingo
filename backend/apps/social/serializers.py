from __future__ import annotations

from django.utils import timezone
from drf_spectacular.helpers import lazy_serializer
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer
from apps.social.models import Comment, CommentLike


class CommentSerializer(serializers.ModelSerializer[Comment]):
    id = serializers.UUIDField(source="public_id", read_only=True)
    author = PublicUserSerializer(read_only=True)
    body = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()
    parent_id = serializers.UUIDField(source="parent.public_id", read_only=True, allow_null=True)

    class Meta:
        model = Comment
        fields = (
            "id",
            "author",
            "body",
            "parent_id",
            "like_count",
            "reply_count",
            "is_liked",
            "replies",
            "edited_at",
            "deleted_at",
            "created_at",
        )

    def get_body(self, obj: Comment) -> str:
        return obj.display_body

    def get_is_liked(self, obj: Comment) -> bool:
        if hasattr(obj, "_is_liked"):
            return bool(obj._is_liked)
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and CommentLike.objects.filter(user=request.user, comment=obj).exists()
        )

    @extend_schema_field(lazy_serializer("apps.social.serializers.CommentSerializer")(many=True))
    def get_replies(self, obj: Comment) -> list[dict]:
        if obj.parent_id:
            return []
        prefetched = getattr(obj, "prefetched_visible_replies", None)
        if prefetched is None:
            return []
        return CommentSerializer(prefetched[:5], many=True, context=self.context).data


class CommentCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2_000, trim_whitespace=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_body(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("A comment cannot be empty.")
        return value.strip()


class CommentUpdateSerializer(serializers.ModelSerializer[Comment]):
    class Meta:
        model = Comment
        fields = ("body",)

    def validate_body(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("A comment cannot be empty.")
        return value.strip()

    def update(self, instance: Comment, validated_data: dict) -> Comment:
        if instance.deleted_at or instance.hidden_at:
            raise serializers.ValidationError("This comment can no longer be edited.")
        if "body" not in validated_data:
            return instance
        instance.body = validated_data["body"]
        instance.edited_at = timezone.now()
        instance.save(update_fields=("body", "edited_at", "updated_at"))
        return instance
