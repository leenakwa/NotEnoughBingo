from __future__ import annotations

from django.db import models

from apps.accounts.models import Follow, User
from apps.common.models import PublicIdModel, TimeStampedModel


class Notification(PublicIdModel, TimeStampedModel):
    class Type(models.TextChoices):
        NEW_COMMENT = "new_comment", "New comment"
        COMMENT_REPLY = "comment_reply", "Comment reply"
        BINGO_LIKE = "bingo_like", "Bingo like"
        COMMENT_LIKE = "comment_like", "Comment like"
        NEW_FOLLOWER = "new_follower", "New follower"

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="triggered_notifications",
    )
    notification_type = models.CharField(max_length=32, choices=Type.choices)
    bingo = models.ForeignKey(
        "bingos.Bingo",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    comment = models.ForeignKey(
        "social.Comment",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    follow = models.ForeignKey(
        Follow,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    dedupe_key = models.CharField(max_length=190)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("recipient", "dedupe_key"), name="unique_notification_dedupe"
            )
        ]
        indexes = [
            models.Index(fields=("recipient", "is_read", "-created_at")),
            models.Index(fields=("recipient", "notification_type", "-created_at")),
        ]
