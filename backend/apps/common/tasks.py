from celery import shared_task
from django.utils import timezone

from apps.common.models import IdempotencyRecord


@shared_task(ignore_result=True)
def cleanup_expired_idempotency_records() -> int:
    deleted, _ = IdempotencyRecord.objects.filter(expires_at__lte=timezone.now()).delete()
    return deleted
