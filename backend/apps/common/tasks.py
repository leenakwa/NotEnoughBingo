from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from apps.common.models import IdempotencyRecord

BEAT_HEARTBEAT_CACHE_KEY = "health:celery-beat:last-seen"


@shared_task(ignore_result=True)
def cleanup_expired_idempotency_records() -> int:
    deleted, _ = IdempotencyRecord.objects.filter(expires_at__lte=timezone.now()).delete()
    return deleted


@shared_task(ignore_result=True)
def record_beat_heartbeat() -> str:
    observed_at = timezone.now().isoformat()
    cache.set(BEAT_HEARTBEAT_CACHE_KEY, observed_at, timeout=300)
    return observed_at
