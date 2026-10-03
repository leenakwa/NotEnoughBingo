from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.analytics.counter_reconciliation import reconcile_denormalized_counters
from apps.analytics.models import InteractionEvent
from apps.analytics.tasks import (
    calculate_trending_score,
    purge_expired_interaction_events,
    recompute_trending_scores,
)
from apps.bingos.models import Bingo, BingoCell, BingoTag, Tag
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.plays.models import SharedResult
from apps.social.models import BingoLike, Comment, CommentLike

pytestmark = pytest.mark.django_db


@pytest.mark.django_db(transaction=True)
def test_existing_search_events_drop_free_text_on_migration() -> None:
    event = InteractionEvent.objects.create(
        event_type=InteractionEvent.Type.SEARCH,
        query="someone@example.test private phrase",
        metadata={
            "surface": "explore",
            "author": "someone@example.test",
            "tags": "private phrase",
            "ordering": "newest",
        },
        occurred_at=timezone.now(),
    )
    current_target = [("analytics", "0003_alter_interactionevent_event_type")]
    try:
        MigrationExecutor(connection).migrate([("analytics", "0001_initial")])
        MigrationExecutor(connection).migrate(current_target)
        event.refresh_from_db()
        assert event.query == ""
        assert event.metadata == {"surface": "explore", "ordering": "newest"}
    finally:
        MigrationExecutor(connection).migrate(current_target)


def test_discover_feed_queries_do_not_grow_with_published_cards(verified_user_factory) -> None:
    author = verified_user_factory()

    def publish(number: int) -> None:
        document = empty_draft_document(title=f"Query board {number}", size=3, language="en")
        document["cells"][0]["text"] = f"Cell {number}"
        document["visibility"] = Bingo.Visibility.PUBLIC
        bingo = create_bingo(author=author, document=document)
        publish_bingo(
            bingo=bingo,
            actor=author,
            idempotency_key=f"query-board-{number}",
        )

    publish(1)
    client = APIClient()
    with CaptureQueriesContext(connection) as one_queries:
        one = client.get("/api/v1/feeds/discover/?page_size=24")
    assert one.status_code == 200
    assert one.data["count"] == 1

    for number in range(2, 13):
        publish(number)
    with CaptureQueriesContext(connection) as twelve_queries:
        twelve = client.get("/api/v1/feeds/discover/?page_size=24")
    assert twelve.status_code == 200
    assert twelve.data["count"] == 12
    assert len(twelve_queries) <= len(one_queries) + 2, (
        f"Discover feed queries grew from {len(one_queries)} to {len(twelve_queries)}"
    )


def test_counter_reconciliation_repairs_relational_drift_without_rewriting_lifetime_totals(
    verified_user_factory,
) -> None:
    owner = verified_user_factory()
    document = empty_draft_document(title="Counter repair", size=3, language="en")
    document["cells"][0]["text"] = "Repair this counter"
    document["visibility"] = Bingo.Visibility.PUBLIC
    bingo = create_bingo(author=owner, document=document)
    revision = publish_bingo(
        bingo=bingo,
        actor=owner,
        idempotency_key="counter-repair-publish",
    )
    tag = Tag.objects.create(name="Reliable", slug="reliable", usage_count=77)
    BingoTag.objects.create(bingo=bingo, tag=tag, position=0)

    first_actor = verified_user_factory()
    second_actor = verified_user_factory()
    BingoLike.objects.create(bingo=bingo, user=first_actor)
    BingoLike.objects.create(bingo=bingo, user=second_actor)
    root = Comment.objects.create(
        bingo=bingo,
        author=first_actor,
        body="Root",
        like_count=77,
        reply_count=77,
    )
    Comment.objects.create(bingo=bingo, author=second_actor, parent=root, body="Reply")
    CommentLike.objects.create(comment=root, user=first_actor)
    CommentLike.objects.create(comment=root, user=second_actor)
    SharedResult.objects.create(
        bingo=bingo,
        revision=revision,
        owner=owner,
        owner_display_name="Owner",
        selected_cells=[str(revision.cells.get(position=0).public_id)],
    )
    Bingo.objects.filter(pk=bingo.pk).update(
        like_count=77,
        comment_count=77,
        share_count=77,
        view_count=123,
        play_count=456,
    )

    assert reconcile_denormalized_counters(batch_size=1, dry_run=True) == {
        "bingos": 1,
        "comments": 1,
        "tags": 1,
    }
    bingo.refresh_from_db()
    root.refresh_from_db()
    tag.refresh_from_db()
    assert (bingo.like_count, root.like_count, tag.usage_count) == (77, 77, 77)

    assert reconcile_denormalized_counters(batch_size=1) == {
        "bingos": 1,
        "comments": 1,
        "tags": 1,
    }
    bingo.refresh_from_db()
    root.refresh_from_db()
    tag.refresh_from_db()
    assert (
        bingo.like_count,
        bingo.comment_count,
        bingo.share_count,
        bingo.view_count,
        bingo.play_count,
    ) == (2, 2, 1, 123, 456)
    assert (root.like_count, root.reply_count, tag.usage_count) == (2, 1, 1)
    assert reconcile_denormalized_counters(batch_size=1) == {
        "bingos": 0,
        "comments": 0,
        "tags": 0,
    }


def test_counter_reconciliation_is_scheduled_daily() -> None:
    schedule = settings.CELERY_BEAT_SCHEDULE["reconcile-denormalized-counters-daily"]
    assert schedule["task"] == "apps.analytics.tasks.reconcile_denormalized_counters"
    assert schedule["schedule"] == timedelta(hours=24)


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


@freeze_time("2026-08-01 12:00:00+00:00")
def test_trending_recomputation_preserves_scores_across_full_and_partial_batches(
    user_factory,
    bingo_factory,
) -> None:
    now = timezone.now()
    actor = user_factory()
    boards = [
        bingo_factory(published_at=now - timedelta(hours=24), trending_score=99) for _ in range(3)
    ]
    InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.LIKE,
        bingo=boards[0],
        occurred_at=now,
    )
    InteractionEvent.objects.create(
        anonymous_id_hash="guest-one",
        event_type=InteractionEvent.Type.LIKE,
        bingo=boards[0],
        occurred_at=now,
    )
    InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.LIKE,
        bingo=boards[2],
        occurred_at=now - timedelta(days=8),
    )

    assert recompute_trending_scores(batch_size=2) == 3
    for board in boards:
        board.refresh_from_db()

    assert boards[0].trending_score == float(
        calculate_trending_score({InteractionEvent.Type.LIKE: 2}, age_hours=24)
    )
    assert boards[1].trending_score == boards[2].trending_score == 0
    assert all(board.trending_score_updated_at == now for board in boards)


@freeze_time("2026-08-01 12:00:00+00:00")
def test_trending_decay_uses_first_publish_not_latest_republish_timestamp(
    user_factory,
    bingo_factory,
) -> None:
    now = timezone.now()
    actor = user_factory()
    first_published = now - timedelta(days=10)
    bingo = bingo_factory(
        published_at=first_published,
        last_published_at=now,
    )
    InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.LIKE,
        bingo=bingo,
        occurred_at=now - timedelta(hours=1),
    )

    recompute_trending_scores()

    bingo.refresh_from_db()
    assert bingo.trending_score == float(
        calculate_trending_score(
            {InteractionEvent.Type.LIKE: 1},
            age_hours=10 * 24,
        )
    )
    assert bingo.trending_score < float(
        calculate_trending_score(
            {InteractionEvent.Type.LIKE: 1},
            age_hours=0,
        )
    )


@freeze_time("2026-08-01 12:00:00+00:00")
@override_settings(ANALYTICS_RAW_EVENT_RETENTION_DAYS=90)
def test_raw_interaction_retention_purges_expired_rows_in_batches(user_factory) -> None:
    actor = user_factory()
    now = timezone.now()
    expired_ids = []
    for index in range(5):
        event = InteractionEvent.objects.create(
            actor=actor,
            event_type=InteractionEvent.Type.SEARCH,
            query=f"expired query {index}",
            anonymous_id_hash=f"expired-hash-{index}",
            occurred_at=now - timedelta(days=91, seconds=index),
        )
        expired_ids.append(event.pk)
    boundary = InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.OPEN,
        occurred_at=now - timedelta(days=90),
    )
    recent = InteractionEvent.objects.create(
        actor=actor,
        event_type=InteractionEvent.Type.OPEN,
        occurred_at=now - timedelta(days=7),
    )

    deleted = purge_expired_interaction_events(batch_size=2)

    assert deleted == 5
    assert not InteractionEvent.objects.filter(pk__in=expired_ids).exists()
    assert InteractionEvent.objects.filter(pk__in=(boundary.pk, recent.pk)).count() == 2
    assert (
        settings.CELERY_BEAT_SCHEDULE["purge-expired-interaction-events-daily"]["task"]
        == "apps.analytics.tasks.purge_expired_interaction_events"
    )


@pytest.mark.parametrize(
    "endpoint",
    ["/api/v1/feeds/trending/", "/api/v1/feeds/discover/"],
)
def test_feed_paginates_ranked_ids_before_hydrating_large_boards(
    endpoint,
    verified_user_factory,
    monkeypatch,
    django_assert_max_num_queries,
) -> None:
    author = verified_user_factory(username="large_feed_author")
    ranked: list[tuple[Bingo, int]] = []
    with freeze_time("2026-07-01 12:00:00+00:00"):
        for index in range(6):
            document = empty_draft_document(title=f"Large board {index}", size=10, language="en")
            document["cells"][0]["text"] = f"Board {index}"
            document["visibility"] = Bingo.Visibility.PUBLIC
            bingo = create_bingo(author=author, document=document)
            revision = publish_bingo(
                bingo=bingo,
                actor=author,
                idempotency_key=f"large-feed-publish-{index}",
            )
            score = 100 - index
            Bingo.objects.filter(pk=bingo.pk).update(trending_score=score)
            ranked.append((bingo, revision.pk))

    hydrated_revision_ids: list[int] = []
    original_from_db = BingoCell.from_db.__func__

    def count_from_db(cls, db, field_names, values):
        cell = original_from_db(cls, db, field_names, values)
        hydrated_revision_ids.append(cell.revision_id)
        return cell

    monkeypatch.setattr(BingoCell, "from_db", classmethod(count_from_db))

    with django_assert_max_num_queries(15):
        first_page = APIClient().get(f"{endpoint}?page_size=2&page=1")

    assert first_page.status_code == 200
    assert first_page.data["count"] == 6
    assert [item["id"] for item in first_page.data["results"]] == [
        str(bingo.public_id) for bingo, _ in ranked[:2]
    ]
    assert len(hydrated_revision_ids) == 200
    assert set(hydrated_revision_ids) == {revision_id for _, revision_id in ranked[:2]}

    hydrated_revision_ids.clear()
    second_page = APIClient().get(f"{endpoint}?page_size=2&page=2")
    assert second_page.status_code == 200
    assert [item["id"] for item in second_page.data["results"]] == [
        str(bingo.public_id) for bingo, _ in ranked[2:4]
    ]
    assert len(hydrated_revision_ids) == 200
    assert set(hydrated_revision_ids) == {revision_id for _, revision_id in ranked[2:4]}
