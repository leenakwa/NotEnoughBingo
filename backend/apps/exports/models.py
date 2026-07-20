from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import PublicIdModel, TimeStampedModel


class ExportJob(PublicIdModel, TimeStampedModel):
    class Kind(models.TextChoices):
        BINGO = "bingo", "Bingo board"
        ACCOUNT_DATA = "account_data", "Account data"

    class Format(models.TextChoices):
        PNG = "png", "PNG"
        PDF = "pdf", "PDF"
        ZIP = "zip", "ZIP"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="export_jobs",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    format = models.CharField(max_length=8, choices=Format.choices)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    bingo = models.ForeignKey(
        "bingos.Bingo",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="export_jobs",
    )
    revision = models.ForeignKey(
        "bingos.BingoRevision",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="export_jobs",
    )
    output_asset = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="export_jobs",
    )
    idempotency_key = models.CharField(max_length=128, blank=True)
    parameters = models.JSONField(default=dict, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    error_code = models.CharField(max_length=80, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "kind", "idempotency_key"),
                condition=~Q(idempotency_key=""),
                name="unique_export_idempotency_key",
            ),
            models.CheckConstraint(
                condition=(
                    Q(kind="bingo", bingo__isnull=False, revision__isnull=False)
                    | Q(kind="account_data", bingo__isnull=True, revision__isnull=True)
                ),
                name="export_target_matches_kind",
            ),
        ]
        indexes = [
            models.Index(fields=("owner", "status", "-created_at")),
            models.Index(fields=("status", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.format}:{self.public_id}"
