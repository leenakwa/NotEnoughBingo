from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer
from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer[Notification]):
    id = serializers.UUIDField(source="public_id", read_only=True)
    kind = serializers.SerializerMethodField()
    actor = PublicUserSerializer(read_only=True, allow_null=True)
    message = serializers.SerializerMethodField()
    target_url = serializers.SerializerMethodField()
    bingo_id = serializers.UUIDField(source="bingo.public_id", read_only=True, allow_null=True)
    comment_id = serializers.UUIDField(source="comment.public_id", read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "kind",
            "actor",
            "message",
            "target_url",
            "bingo_id",
            "comment_id",
            "is_read",
            "read_at",
            "created_at",
        )

    def get_kind(self, obj: Notification) -> str:
        if obj.notification_type == Notification.Type.NEW_COMMENT:
            return "bingo_comment"
        return obj.notification_type

    def get_message(self, obj: Notification) -> str:
        actor_name = (
            obj.actor.profile.display_name or obj.actor.username if obj.actor else "Someone"
        )
        messages = {
            Notification.Type.NEW_COMMENT: f"{actor_name} commented on your bingo.",
            Notification.Type.COMMENT_REPLY: f"{actor_name} replied to your comment.",
            Notification.Type.BINGO_LIKE: f"{actor_name} liked your bingo.",
            Notification.Type.COMMENT_LIKE: f"{actor_name} liked your comment.",
            Notification.Type.NEW_FOLLOWER: f"{actor_name} followed you.",
        }
        return messages[obj.notification_type]

    def get_target_url(self, obj: Notification) -> str:
        if obj.bingo_id:
            suffix = f"#comment-{obj.comment.public_id}" if obj.comment_id else ""
            return f"/bingo/{obj.bingo.public_id}{suffix}"
        if obj.comment_id:
            return f"/bingo/{obj.comment.bingo.public_id}#comment-{obj.comment.public_id}"
        if obj.actor:
            return f"/profile/{obj.actor.username}"
        return "/notifications"
