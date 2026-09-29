from __future__ import annotations

from collections.abc import Callable

from django.db.models import BigIntegerField, Count, F, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from apps.bingos.models import Bingo, BingoTag, Tag
from apps.plays.models import SharedResult
from apps.social.models import BingoLike, Comment, CommentLike

DEFAULT_COUNTER_BATCH_SIZE = 500
MAX_COUNTER_BATCH_SIZE = 5_000


def _safe_batch_size(batch_size: int) -> int:
    return max(1, min(int(batch_size), MAX_COUNTER_BATCH_SIZE))


def _process_drifted_rows(
    *,
    drifted_queryset,  # type: ignore[no-untyped-def]
    update_batch: Callable[[list[int]], int],
    batch_size: int,
    dry_run: bool,
) -> int:
    """Inspect/update primary keys in bounded, restart-safe ascending batches."""

    processed = 0
    last_pk = 0
    while True:
        primary_keys = list(
            drifted_queryset.filter(pk__gt=last_pk)
            .order_by("pk")
            .values_list("pk", flat=True)[:batch_size]
        )
        if not primary_keys:
            return processed
        processed += len(primary_keys)
        last_pk = primary_keys[-1]
        if not dry_run:
            update_batch(primary_keys)


def reconcile_denormalized_counters(
    *,
    batch_size: int = DEFAULT_COUNTER_BATCH_SIZE,
    dry_run: bool = False,
) -> dict[str, int]:
    """Repair counters that have authoritative relational source rows.

    Lifetime view/play counters deliberately stay untouched: raw interaction
    events expire, so those historical totals cannot be reconstructed exactly.
    """

    safe_batch_size = _safe_batch_size(batch_size)

    bingo_like_total = Coalesce(
        Subquery(
            BingoLike.objects.filter(bingo_id=OuterRef("pk"))
            .values("bingo_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=BigIntegerField(),
        ),
        Value(0),
        output_field=BigIntegerField(),
    )
    bingo_comment_total = Coalesce(
        Subquery(
            Comment.objects.filter(bingo_id=OuterRef("pk"))
            .values("bingo_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=BigIntegerField(),
        ),
        Value(0),
        output_field=BigIntegerField(),
    )
    bingo_share_total = Coalesce(
        Subquery(
            SharedResult.objects.filter(bingo_id=OuterRef("pk"))
            .values("bingo_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=BigIntegerField(),
        ),
        Value(0),
        output_field=BigIntegerField(),
    )
    drifted_bingos = Bingo.objects.annotate(
        expected_like_count=bingo_like_total,
        expected_comment_count=bingo_comment_total,
        expected_share_count=bingo_share_total,
    ).exclude(
        Q(
            like_count=F("expected_like_count"),
            comment_count=F("expected_comment_count"),
            share_count=F("expected_share_count"),
        )
    )

    def update_bingos(primary_keys: list[int]) -> int:
        return Bingo.objects.filter(pk__in=primary_keys).update(
            like_count=bingo_like_total,
            comment_count=bingo_comment_total,
            share_count=bingo_share_total,
        )

    comment_like_total = Coalesce(
        Subquery(
            CommentLike.objects.filter(comment_id=OuterRef("pk"))
            .values("comment_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=IntegerField(),
        ),
        Value(0),
        output_field=IntegerField(),
    )
    reply_total = Coalesce(
        Subquery(
            Comment.objects.filter(parent_id=OuterRef("pk"))
            .values("parent_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=IntegerField(),
        ),
        Value(0),
        output_field=IntegerField(),
    )
    drifted_comments = Comment.objects.annotate(
        expected_like_count=comment_like_total,
        expected_reply_count=reply_total,
    ).exclude(
        Q(
            like_count=F("expected_like_count"),
            reply_count=F("expected_reply_count"),
        )
    )

    def update_comments(primary_keys: list[int]) -> int:
        return Comment.objects.filter(pk__in=primary_keys).update(
            like_count=comment_like_total,
            reply_count=reply_total,
        )

    tag_usage_total = Coalesce(
        Subquery(
            BingoTag.objects.filter(tag_id=OuterRef("pk"))
            .values("tag_id")
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=BigIntegerField(),
        ),
        Value(0),
        output_field=BigIntegerField(),
    )
    drifted_tags = Tag.objects.annotate(expected_usage_count=tag_usage_total).exclude(
        usage_count=F("expected_usage_count")
    )

    def update_tags(primary_keys: list[int]) -> int:
        return Tag.objects.filter(pk__in=primary_keys).update(usage_count=tag_usage_total)

    return {
        "bingos": _process_drifted_rows(
            drifted_queryset=drifted_bingos,
            update_batch=update_bingos,
            batch_size=safe_batch_size,
            dry_run=dry_run,
        ),
        "comments": _process_drifted_rows(
            drifted_queryset=drifted_comments,
            update_batch=update_comments,
            batch_size=safe_batch_size,
            dry_run=dry_run,
        ),
        "tags": _process_drifted_rows(
            drifted_queryset=drifted_tags,
            update_batch=update_tags,
            batch_size=safe_batch_size,
            dry_run=dry_run,
        ),
    }
