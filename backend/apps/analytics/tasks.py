from __future__ import annotations

import math
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.analytics.counter_reconciliation import (
    reconcile_denormalized_counters as reconcile_counters,
)
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo
from apps.common.jobs import periodic_task

EVENT_WEIGHTS = {
    InteractionEvent.Type.IMPRESSION: 0.05,
    InteractionEvent.Type.VIEW: 0.25,
    InteractionEvent.Type.OPEN: 0.5,
    InteractionEvent.Type.LIKE: 3.0,
    InteractionEvent.Type.UNLIKE: -3.0,
    InteractionEvent.Type.START: 2.0,
    InteractionEvent.Type.COMPLETE: 4.0,
    InteractionEvent.Type.RESET: 0.0,
    InteractionEvent.Type.SHARE: 5.0,
    InteractionEvent.Type.COMMENT: 3.5,
}
INTERACTION_DELETE_BATCH_SIZE = 5_000
TRENDING_BATCH_SIZE = 500


@periodic_task
def reconcile_denormalized_counters(batch_size: int = 500) -> dict[str, int]:
    return reconcile_counters(batch_size=batch_size)


def calculate_trending_score(
    event_counts: dict[str, int], *, age_hours: float, half_life_hours: float = 72.0
) -> Decimal:
    weighted = sum(
        EVENT_WEIGHTS.get(event_type, 0.0) * count for event_type, count in event_counts.items()
    )
    weighted = max(0.0, weighted)
    decay = math.pow(0.5, max(0.0, age_hours) / half_life_hours)
    confidence_adjusted = math.log1p(weighted) * decay
    return Decimal(f"{confidence_adjusted:.6f}")


@periodic_task
def recompute_trending_scores(batch_size: int = TRENDING_BATCH_SIZE) -> int:
    now = timezone.now()
    cutoff = now - timedelta(days=7)
    safe_batch_size = max(1, min(int(batch_size), TRENDING_BATCH_SIZE))

    def update_batch(batch: list[Bingo]) -> None:
        counts: dict[int, dict[str, int]] = {bingo.pk: {} for bingo in batch}
        rows = (
            InteractionEvent.objects.filter(
                occurred_at__gte=cutoff,
                bingo_id__in=[bingo.pk for bingo in batch],
            )
            .values("bingo_id", "event_type")
            .annotate(
                authenticated_total=Count("actor_id", distinct=True),
                anonymous_total=Count(
                    "anonymous_id_hash",
                    distinct=True,
                    filter=~Q(anonymous_id_hash=""),
                ),
            )
        )
        for row in rows.iterator(chunk_size=2000):
            counts[row["bingo_id"]][row["event_type"]] = (
                row["authenticated_total"] + row["anonymous_total"]
            )

        for bingo in batch:
            age_hours = (
                (now - bingo.published_at).total_seconds() / 3600 if bingo.published_at else 0
            )
            bingo.trending_score = calculate_trending_score(counts[bingo.pk], age_hours=age_hours)
            bingo.trending_score_updated_at = now
            bingo.updated_at = now
        Bingo.objects.bulk_update(
            batch,
            fields=("trending_score", "trending_score_updated_at", "updated_at"),
        )

    updated = 0
    batch: list[Bingo] = []
    for bingo in (
        Bingo.objects.filter(
            status=Bingo.Status.PUBLISHED,
            visibility=Bingo.Visibility.PUBLIC,
            deleted_at__isnull=True,
        )
        .only("pk", "published_at")
        .iterator(chunk_size=safe_batch_size)
    ):
        batch.append(bingo)
        if len(batch) == safe_batch_size:
            update_batch(batch)
            updated += len(batch)
            batch.clear()
    if batch:
        update_batch(batch)
        updated += len(batch)
    return updated


@periodic_task
def purge_expired_interaction_events(
    batch_size: int = INTERACTION_DELETE_BATCH_SIZE,
) -> int:
    """Delete raw interaction rows after the configured collection window."""

    retention_days = int(settings.ANALYTICS_RAW_EVENT_RETENTION_DAYS)
    cutoff = timezone.now() - timedelta(days=retention_days)
    safe_batch_size = max(1, min(int(batch_size), INTERACTION_DELETE_BATCH_SIZE))
    deleted_total = 0
    while True:
        expired_ids = list(
            InteractionEvent.objects.filter(occurred_at__lt=cutoff)
            .order_by("pk")
            .values_list("pk", flat=True)[:safe_batch_size]
        )
        if not expired_ids:
            return deleted_total
        deleted, _ = InteractionEvent.objects.filter(pk__in=expired_ids).delete()
        deleted_total += deleted
