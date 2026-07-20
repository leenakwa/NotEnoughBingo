from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.core.files.storage import default_storage
from django.db import models, transaction
from django.utils import timezone

from apps.media_assets.models import MediaAsset
from apps.media_assets.services import (
    ORPHAN_GRACE_PERIOD,
    asset_is_referenced,
    create_thumbnail,
    inspect_asset,
    promote_validated_asset,
)
from apps.media_assets.validators import AssetValidationError, normalize_image_bytes
from apps.media_assets.validators import inspect_image as inspect_normalized_image


@shared_task(
    bind=True,
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def process_media_asset(self, asset_id: int) -> str:
    task_id = str(self.request.id or f"direct-{asset_id}")
    with transaction.atomic():
        asset = MediaAsset.objects.select_for_update().filter(pk=asset_id).first()
        if not asset or asset.status == MediaAsset.Status.READY:
            return "already_processed"
        if asset.status not in {MediaAsset.Status.UPLOADED, MediaAsset.Status.PROCESSING}:
            return "not_processable"
        if (
            asset.status == MediaAsset.Status.PROCESSING
            and asset.processing_task_id
            and asset.processing_task_id != task_id
        ):
            return "already_processing"
        asset.status = MediaAsset.Status.PROCESSING
        asset.processing_task_id = task_id
        asset.save(update_fields=("status", "processing_task_id", "updated_at"))
    try:
        data, _original_inspection = inspect_asset(asset)
        normalized_data = normalize_image_bytes(data)
        inspection = inspect_normalized_image(
            normalized_data,
            declared_mime="image/webp",
            expected_size=len(normalized_data),
        )
        staging_key = asset.storage_key
        final_key = promote_validated_asset(
            asset=asset,
            data=normalized_data,
            inspection=inspection,
        )
        create_thumbnail(original=asset, data=normalized_data)
    except AssetValidationError as exc:
        with transaction.atomic():
            rejected = MediaAsset.objects.select_for_update().get(pk=asset_id)
            rejected.status = MediaAsset.Status.REJECTED
            rejected.rejection_reason = exc.code
            rejected.processing_task_id = ""
            rejected.save(
                update_fields=(
                    "status",
                    "processing_task_id",
                    "rejection_reason",
                    "updated_at",
                )
            )
        if default_storage.exists(asset.storage_key):
            default_storage.delete(asset.storage_key)
        return f"rejected:{exc.code}"
    with transaction.atomic():
        ready = MediaAsset.objects.select_for_update().get(pk=asset_id)
        ready.status = MediaAsset.Status.READY
        ready.processing_task_id = ""
        ready.storage_key = final_key
        ready.detected_mime = inspection.mime
        ready.extension = inspection.extension
        ready.byte_size = inspection.byte_size
        ready.checksum_sha256 = inspection.checksum_sha256
        ready.width = inspection.width
        ready.height = inspection.height
        ready.ready_at = timezone.now()
        ready.rejection_reason = ""
        ready.save(
            update_fields=(
                "status",
                "processing_task_id",
                "storage_key",
                "detected_mime",
                "extension",
                "byte_size",
                "checksum_sha256",
                "width",
                "height",
                "ready_at",
                "rejection_reason",
                "updated_at",
            )
        )
        transaction.on_commit(
            lambda: (
                default_storage.delete(staging_key) if default_storage.exists(staging_key) else None
            )
        )
    return "ready"


@shared_task(ignore_result=True)
def cleanup_orphaned_media() -> int:
    now = timezone.now()
    candidates = MediaAsset.objects.filter(
        deleted_at__isnull=True,
        created_at__lt=now - ORPHAN_GRACE_PERIOD,
    ).filter(
        models.Q(status=MediaAsset.Status.PENDING, expires_at__lt=now)
        | models.Q(
            status__in=(MediaAsset.Status.UPLOADED, MediaAsset.Status.PROCESSING),
            updated_at__lt=now - timedelta(hours=6),
        )
        | models.Q(
            status__in=(MediaAsset.Status.REJECTED, MediaAsset.Status.QUARANTINED),
            updated_at__lt=now - timedelta(days=7),
        )
        | models.Q(
            status=MediaAsset.Status.READY,
            ready_at__lt=now - ORPHAN_GRACE_PERIOD,
            expires_at__isnull=True,
        )
        | models.Q(status=MediaAsset.Status.READY, expires_at__lt=now)
    )
    cleaned = 0
    for asset_id in candidates.values_list("pk", flat=True).iterator():
        with transaction.atomic():
            asset = MediaAsset.objects.select_for_update().filter(pk=asset_id).first()
            if not asset or asset_is_referenced(asset):
                continue
            if default_storage.exists(asset.storage_key):
                default_storage.delete(asset.storage_key)
            asset.status = MediaAsset.Status.DELETED
            asset.deleted_at = now
            asset.save(update_fields=("status", "deleted_at", "updated_at"))
            cleaned += 1
    return cleaned
