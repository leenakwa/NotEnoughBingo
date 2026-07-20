from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from celery import shared_task
from django.db.models import Count, Q
from django.utils import timezone

from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo

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


@shared_task(ignore_result=True)
def recompute_trending_scores() -> int:
    now = timezone.now()
    counts: dict[int, dict[str, int]] = defaultdict(dict)
    rows = (
        InteractionEvent.objects.filter(
            occurred_at__gte=now - timedelta(days=7),
            bingo_id__isnull=False,
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
    for row in rows.iterator():
        counts[row["bingo_id"]][row["event_type"]] = (
            row["authenticated_total"] + row["anonymous_total"]
        )

    updated = 0
    for bingo in Bingo.objects.filter(
        status=Bingo.Status.PUBLISHED,
        visibility=Bingo.Visibility.PUBLIC,
        deleted_at__isnull=True,
    ).only("pk", "published_at"):
        age_hours = (now - bingo.published_at).total_seconds() / 3600 if bingo.published_at else 0
        bingo.trending_score = calculate_trending_score(
            counts.get(bingo.pk, {}), age_hours=age_hours
        )
        bingo.trending_score_updated_at = now
        bingo.save(update_fields=("trending_score", "trending_score_updated_at", "updated_at"))
        updated += 1
    return updated
