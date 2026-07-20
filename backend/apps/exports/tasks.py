from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.exports.account_data import build_account_export
from apps.exports.models import ExportJob
from apps.exports.renderers import render_revision_pdf, render_revision_png
from apps.media_assets.models import MediaAsset
from apps.media_assets.services import create_generated_asset

logger = logging.getLogger(__name__)


@shared_task(
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def process_export_job(job_id: int) -> str:
    with transaction.atomic():
        job = (
            ExportJob.objects.select_for_update()
            .select_related("owner", "revision", "revision__published_by")
            .filter(pk=job_id)
            .first()
        )
        if not job:
            return "missing"
        if job.status == ExportJob.Status.READY:
            return "already_ready"
        # Only a queued job may claim execution. A duplicate delivery that sees
        # PROCESSING must not render/store a second output asset.
        if job.status != ExportJob.Status.QUEUED:
            return "not_processable"
        job.status = ExportJob.Status.PROCESSING
        job.started_at = job.started_at or timezone.now()
        job.attempt_count += 1
        job.error_code = ""
        job.save(
            update_fields=(
                "status",
                "started_at",
                "attempt_count",
                "error_code",
                "updated_at",
            )
        )
    try:
        if job.kind == ExportJob.Kind.ACCOUNT_DATA:
            data = build_account_export(job.owner)
            extension = ".zip"
            mime = "application/zip"
            asset_kind = MediaAsset.Kind.ACCOUNT_EXPORT
            prefix = "exports/accounts"
        elif job.format == ExportJob.Format.PNG:
            data = render_revision_png(job.revision)
            extension = ".png"
            mime = "image/png"
            asset_kind = MediaAsset.Kind.BINGO_EXPORT
            prefix = "exports/bingos"
        elif job.format == ExportJob.Format.PDF:
            data = render_revision_pdf(job.revision)
            extension = ".pdf"
            mime = "application/pdf"
            asset_kind = MediaAsset.Kind.BINGO_EXPORT
            prefix = "exports/bingos"
        else:
            raise ValueError("unsupported_export_format")
        asset = create_generated_asset(
            owner=job.owner,
            kind=asset_kind,
            data=data,
            extension=extension,
            mime=mime,
            storage_prefix=prefix,
            expires_at=job.expires_at,
        )
    except OSError:
        with transaction.atomic():
            ExportJob.objects.filter(pk=job_id).update(
                status=ExportJob.Status.QUEUED,
                error_code="temporary_storage_error",
            )
        raise
    except Exception:
        logger.exception("Export job %s failed", job_id)
        with transaction.atomic():
            failed = ExportJob.objects.select_for_update().get(pk=job_id)
            failed.status = ExportJob.Status.FAILED
            failed.error_code = "export_failed"
            failed.completed_at = timezone.now()
            failed.save(update_fields=("status", "error_code", "completed_at", "updated_at"))
        return "failed"
    with transaction.atomic():
        complete = ExportJob.objects.select_for_update().get(pk=job_id)
        complete.output_asset = asset
        complete.status = ExportJob.Status.READY
        complete.completed_at = timezone.now()
        complete.error_code = ""
        complete.save(
            update_fields=(
                "output_asset",
                "status",
                "completed_at",
                "error_code",
                "updated_at",
            )
        )
    return "ready"


@shared_task(ignore_result=True)
def expire_export_jobs() -> int:
    now = timezone.now()
    jobs = list(
        ExportJob.objects.filter(
            status=ExportJob.Status.READY,
            expires_at__lte=now,
        ).select_related("output_asset")
    )
    for job in jobs:
        if job.output_asset_id:
            from apps.media_assets.services import delete_unreferenced_asset

            # Detach before reference-aware media cleanup.
            asset = job.output_asset
            ExportJob.objects.filter(pk=job.pk).update(output_asset=None)
            delete_unreferenced_asset(asset=asset)
    return ExportJob.objects.filter(pk__in=[job.pk for job in jobs]).update(
        status=ExportJob.Status.EXPIRED
    )
