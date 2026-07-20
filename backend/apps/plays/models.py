from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import PublicIdModel, TimeStampedModel


def generate_share_id() -> str:
    # 192 random bits, encoded without unsafe URL characters.
    return secrets.token_urlsafe(24)


class PlayProgress(PublicIdModel, TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="play_progress",
    )
    bingo = models.ForeignKey(
        "bingos.Bingo",
        on_delete=models.CASCADE,
        related_name="play_progress",
    )
    revision = models.ForeignKey(
        "bingos.BingoRevision",
        on_delete=models.PROTECT,
        related_name="play_progress",
    )
    selected_cells = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=1)
    reset_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("user", "bingo"),
                name="unique_user_bingo_progress",
            ),
            models.CheckConstraint(
                condition=Q(version__gte=1),
                name="play_progress_version_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "-updated_at")),
            models.Index(fields=("bingo", "revision")),
        ]


class SharedResult(PublicIdModel, TimeStampedModel):
    class Access(models.TextChoices):
        PUBLIC = "public", "Anyone with the link"
        OWNER_ONLY = "owner_only", "Owner only"

    share_id = models.CharField(
        max_length=64,
        unique=True,
        default=generate_share_id,
        editable=False,
        db_index=True,
    )
    bingo = models.ForeignKey(
        "bingos.Bingo",
        on_delete=models.PROTECT,
        related_name="shared_results",
    )
    revision = models.ForeignKey(
        "bingos.BingoRevision",
        on_delete=models.PROTECT,
        related_name="shared_results",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="shared_results",
    )
    owner_display_name = models.CharField(max_length=80)
    guest_session_hash = models.CharField(max_length=64, blank=True)
    selected_cells = models.JSONField(default=list)
    access = models.CharField(
        max_length=16,
        choices=Access.choices,
        default=Access.PUBLIC,
        db_index=True,
    )
    hidden_at = models.DateTimeField(null=True, blank=True, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)

    IMMUTABLE_FIELDS = (
        "share_id",
        "bingo_id",
        "revision_id",
        "owner_id",
        "owner_display_name",
        "guest_session_hash",
        "selected_cells",
        "access",
        "created_at",
    )

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(owner__isnull=False, guest_session_hash="")
                    | (Q(owner__isnull=True) & ~Q(guest_session_hash=""))
                ),
                name="shared_result_owner_or_guest_session",
            ),
            models.CheckConstraint(
                condition=Q(access="public") | Q(owner__isnull=False),
                name="owner_only_share_requires_owner",
            ),
        ]
        indexes = [
            models.Index(fields=("bingo", "-created_at")),
            models.Index(fields=("owner", "-created_at")),
            models.Index(fields=("access", "hidden_at", "revoked_at")),
        ]

    def save(self, *args, **kwargs) -> None:
        if self.pk and not self._state.adding:
            original = type(self).objects.filter(pk=self.pk).values(*self.IMMUTABLE_FIELDS).get()
            for field in self.IMMUTABLE_FIELDS:
                if field == "created_at":
                    current = self.created_at
                else:
                    current = getattr(self, field)
                if current != original[field]:
                    raise RuntimeError("Shared result snapshots are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Shared results are revoked or hidden, not deleted.")

    def __str__(self) -> str:
        return f"{self.bingo_id}:{self.share_id}"
