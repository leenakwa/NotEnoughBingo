from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.common.models import PublicIdModel, TimeStampedModel


class MediaAsset(PublicIdModel, TimeStampedModel):
    class Kind(models.TextChoices):
        AVATAR = "avatar", "Avatar"
        COVER = "cover", "Bingo cover"
        BOARD_BACKGROUND = "board_background", "Board background"
        CELL_IMAGE = "cell_image", "Cell image"
        BINGO_EXPORT = "bingo_export", "Bingo export"
        ACCOUNT_EXPORT = "account_export", "Account export"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending upload"
        UPLOADED = "uploaded", "Uploaded"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        REJECTED = "rejected", "Rejected"
        QUARANTINED = "quarantined", "Quarantined"
        DELETED = "deleted", "Deleted"

    class Variant(models.TextChoices):
        ORIGINAL = "original", "Original"
        THUMBNAIL = "thumbnail", "Thumbnail"
        GENERATED = "generated", "Generated"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_assets",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    variant = models.CharField(
        max_length=16,
        choices=Variant.choices,
        default=Variant.ORIGINAL,
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="derivatives",
    )
    storage_key = models.CharField(max_length=500, unique=True)
    storage_bucket = models.CharField(max_length=128, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    extension = models.CharField(max_length=12, blank=True)
    declared_mime = models.CharField(max_length=100, blank=True)
    detected_mime = models.CharField(max_length=100, blank=True)
    expected_size = models.PositiveBigIntegerField(default=1)
    byte_size = models.PositiveBigIntegerField(null=True, blank=True)
    expected_checksum_sha256 = models.CharField(max_length=64, blank=True)
    checksum_sha256 = models.CharField(max_length=64, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    processing_task_id = models.CharField(max_length=64, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejection_reason = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expected_size__gt=0),
                name="media_expected_size_positive",
            ),
            models.UniqueConstraint(
                fields=("parent", "variant"),
                condition=models.Q(parent__isnull=False),
                name="media_unique_parent_variant",
            ),
        ]
        indexes = [
            models.Index(fields=("owner", "status", "-created_at")),
            models.Index(fields=("status", "expires_at")),
            models.Index(fields=("kind", "status", "-created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.public_id} ({self.status})"

    @property
    def is_ready(self) -> bool:
        return self.status == self.Status.READY and self.deleted_at is None
