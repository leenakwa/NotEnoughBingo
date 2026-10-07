import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import models, transaction
from django.utils import timezone

from apps.common.jobs import periodic_task, publish_job
from apps.common.models import IdempotencyRecord

BEAT_HEARTBEAT_CACHE_KEY = "health:celery-beat:last-seen"
logger = logging.getLogger("app.scheduler")


@periodic_task
def cleanup_expired_idempotency_records() -> int:
    deleted, _ = IdempotencyRecord.objects.filter(expires_at__lte=timezone.now()).delete()
    return deleted


@shared_task(ignore_result=True)
def record_beat_heartbeat() -> str:
    observed_at = timezone.now().isoformat()
    cache.set(BEAT_HEARTBEAT_CACHE_KEY, observed_at, timeout=300)
    return observed_at


@periodic_task
def recover_stalled_jobs() -> dict[str, int]:
    """Retry pending jobs after five minutes and expired worker claims safely.

    Limit each sweep to 100 records per type. Row locks, state checks and the
    new timestamp prevent duplicate requeueing; persistent attempt counts
    bound repeated crashes even when the broker redelivers a fresh task ID.
    """
    from apps.exports.models import ExportJob
    from apps.exports.tasks import process_export_job
    from apps.media_assets.models import MediaAsset
    from apps.media_assets.tasks import process_media_asset

    now = timezone.now()
    pending_cutoff = now - timedelta(minutes=5)
    processing_cutoff = now - timedelta(seconds=int(settings.CELERY_TASK_TIME_LIMIT) + 60)
    recovered = {"exports": 0, "media": 0, "failed": 0}
    for model, statuses, field, process, category in (
        (ExportJob, ("queued", "processing"), "attempt_count", process_export_job, "exports"),
        (
            MediaAsset,
            ("uploaded", "processing"),
            "processing_attempt_count",
            process_media_asset,
            "media",
        ),
    ):
        candidates = model.objects.filter(
            models.Q(status=statuses[0], updated_at__lt=pending_cutoff)
            | models.Q(status=statuses[1], updated_at__lt=processing_cutoff)
        )
        if model is MediaAsset:
            candidates = candidates.filter(deleted_at__isnull=True)
        for pk in list(candidates.order_by("updated_at", "pk").values_list("pk", flat=True)[:100]):
            with transaction.atomic():
                item = candidates.select_for_update(skip_locked=True).filter(pk=pk).first()
                if item is None:
                    continue
                previous_updated_at = item.updated_at
                exhausted = getattr(item, field) >= 5
                if model is ExportJob:
                    item.status = "failed" if exhausted else "queued"
                    item.error_code = "worker_interrupted" if exhausted else ""
                    item.completed_at = now if exhausted else None
                else:
                    item.status = "rejected" if exhausted else "uploaded"
                    item.rejection_reason = "processing_interrupted" if exhausted else ""
                    item.processing_task_id = ""
                item.save()
                if exhausted:
                    recovered["failed"] += 1
                    logger.error(
                        "scheduled.job.recovery_failed",
                        extra={"task_name": process.name, "job_id": pk, "outcome": "failed"},
                    )
                else:

                    def publish_recovery(
                        model=model,
                        pk=pk,
                        process=process,
                        pending_status=statuses[0],
                        previous_updated_at=previous_updated_at,
                        claimed_updated_at=item.updated_at,
                    ) -> None:
                        if not publish_job(process, pk):
                            # A failed publish must remain eligible next sweep. A
                            # worker may still receive an ambiguously sent message.
                            model.objects.filter(
                                pk=pk,
                                status=pending_status,
                                updated_at=claimed_updated_at,
                            ).update(updated_at=previous_updated_at)

                    transaction.on_commit(publish_recovery)
                    recovered[category] += 1
    return recovered
