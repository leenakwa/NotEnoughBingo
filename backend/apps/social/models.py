from __future__ import annotations

from django.db import models

from apps.accounts.models import User
from apps.common.models import PublicIdModel, SoftDeleteModel, TimeStampedModel


class BingoLike(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="bingo_likes")
    bingo = models.ForeignKey("bingos.Bingo", on_delete=models.CASCADE, related_name="likes")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "bingo"), name="unique_bingo_like")]
        indexes = [
            models.Index(fields=("bingo", "-created_at")),
            models.Index(fields=("user", "-created_at")),
        ]


class Comment(PublicIdModel, SoftDeleteModel, TimeStampedModel):
    bingo = models.ForeignKey("bingos.Bingo", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="comments")
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )
    body = models.TextField(max_length=2_000)
    edited_at = models.DateTimeField(null=True, blank=True)
    hidden_at = models.DateTimeField(null=True, blank=True, db_index=True)
    hidden_reason = models.CharField(max_length=500, blank=True)
    like_count = models.PositiveIntegerField(default=0)
    reply_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(parent=models.F("id")),
                name="comment_cannot_parent_itself",
            )
        ]
        indexes = [
            models.Index(fields=("bingo", "parent", "hidden_at", "-created_at")),
            models.Index(fields=("author", "-created_at")),
        ]

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def display_body(self) -> str:
        if self.deleted_at:
            return "[deleted]"
        if self.hidden_at:
            return "[hidden by moderation]"
        return self.body


class CommentLike(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="comment_likes")
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="likes")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("user", "comment"), name="unique_comment_like")
        ]
        indexes = [
            models.Index(fields=("comment", "-created_at")),
            models.Index(fields=("user", "-created_at")),
        ]
