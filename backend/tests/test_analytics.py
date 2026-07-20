from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from freezegun import freeze_time

from apps.analytics.models import InteractionEvent
from apps.analytics.tasks import calculate_trending_score, recompute_trending_scores
from apps.bingos.models import Bingo

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("event_counts", "age_hours", "expected"),
    [
        ({InteractionEvent.Type.LIKE: 1}, 0, Decimal("1.386294")),
        ({InteractionEvent.Type.LIKE: 1}, 72, Decimal("0.693147")),
        ({InteractionEvent.Type.UNLIKE: 10}, 0, Decimal("0.000000")),
        (
            {
                InteractionEvent.Type.LIKE: 2,
                InteractionEvent.Type.COMPLETE: 1,
                InteractionEvent.Type.SHARE: 1,
            },
            0,
            Decimal("2.772589"),
        ),
    ],
)
def test_trending_score_has_documented_weights_and_time_decay(
    event_counts: dict[str, int],
    age_hours: float,
    expected: Decimal,
) -> None:
    assert calculate_trending_score(event_counts, age_hours=age_hours) == expected


def test_trending_score_is_deterministic_and_input_order_independent() -> None:
    first = {
        InteractionEvent.Type.SHARE: 2,
        InteractionEvent.Type.VIEW: 100,
        InteractionEvent.Type.COMMENT: 3,
    }
    second = dict(reversed(list(first.items())))

    score = calculate_trending_score(first, age_hours=18.25)

    assert score == calculate_trending_score(first, age_hours=18.25)
    assert score == calculate_trending_score(second, age_hours=18.25)


def test_client_event_id_provides_ingestion_idempotency(user_factory, bingo_factory) -> None:
    user = user_factory()
    bingo = bingo_factory()
    event_id = uuid.uuid4()
    InteractionEvent.objects.create(
        actor=user,
        client_event_id=event_id,
        event_type=InteractionEvent.Type.OPEN,
        bingo=bingo,
        occurred_at=timezone.now(),
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        InteractionEvent.objects.create(
            actor=user,
            client_event_id=event_id,
            event_type=InteractionEvent.Type.OPEN,
            bingo=bingo,
            occurred_at=timezone.now(),
        )


@freeze_time("2026-07-20 12:00:00+00:00")
def test_recompute_trending_scores_is_repeatable_and_scoped_to_public_bingos(
    user_factory,
    bingo_factory,
) -> None:
    now = timezone.now()
    actor = user_factory()
    public = bingo_factory(
        published_at=now - timedelta(hours=24),
        trending_score=999,
    )
    unlisted = bingo_factory(
        visibility=Bingo.Visibility.UNLISTED,
        published_at=now - timedelta(hours=24),
        trending_score=123,
    )
    InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.LIKE,
        bingo=public,
        occurred_at=now - timedelta(hours=1),
    )
    InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.SHARE,
        bingo=public,
        occurred_at=now - timedelta(hours=2),
    )

    first_updated = recompute_trending_scores()
    public.refresh_from_db()
    unlisted.refresh_from_db()
    first_score = public.trending_score
    first_timestamp = public.trending_score_updated_at
    second_updated = recompute_trending_scores()
    public.refresh_from_db()

    expected = float(
        calculate_trending_score(
            {
                InteractionEvent.Type.LIKE: 1,
                InteractionEvent.Type.SHARE: 1,
            },
            age_hours=24,
        )
    )
    assert first_updated == second_updated == 1
    assert first_score == expected
    assert public.trending_score == first_score
    assert public.trending_score_updated_at == first_timestamp == now
    assert unlisted.trending_score == 123
    assert unlisted.trending_score_updated_at is None
