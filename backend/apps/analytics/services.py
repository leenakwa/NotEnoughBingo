from __future__ import annotations

from datetime import timedelta

from django.db import models
from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.models import User
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo, BingoTag


def record_server_event(
    *,
    event_type: str,
    actor: User | None = None,
    anonymous_id_hash: str = "",
    bingo: Bingo | None = None,
    revision=None,
    metadata: dict | None = None,
) -> InteractionEvent:
    return InteractionEvent.objects.create(
        actor=actor,
        anonymous_id_hash=anonymous_id_hash,
        source=InteractionEvent.Source.SERVER,
        event_type=event_type,
        bingo=bingo,
        revision=revision,
        metadata=metadata or {},
        occurred_at=timezone.now(),
    )


def public_feed_queryset(user: User | None = None) -> QuerySet[Bingo]:
    queryset = (
        Bingo.objects.filter(
            status=Bingo.Status.PUBLISHED,
            visibility=Bingo.Visibility.PUBLIC,
            deleted_at__isnull=True,
            hidden_at__isnull=True,
        )
        .select_related(
            "author",
            "author__profile",
            "author__profile__avatar",
            "cover",
            "current_revision",
        )
        .prefetch_related(
            models.Prefetch(
                "tag_links",
                queryset=BingoTag.objects.select_related("tag").order_by("position"),
            ),
            "cover__derivatives",
            "author__profile__avatar__derivatives",
        )
    )
    if user and user.is_authenticated:
        from apps.social.models import BingoLike

        queryset = queryset.prefetch_related(
            models.Prefetch(
                "likes",
                queryset=BingoLike.objects.filter(user=user),
                to_attr="_viewer_likes",
            )
        )
    return queryset


def trending_feed(limit: int = 24, user: User | None = None) -> list[Bingo]:
    return list(
        public_feed_queryset(user).order_by("-trending_score", "-published_at", "-pk")[:limit]
    )


def discover_feed(user: User | None, limit: int = 24) -> list[Bingo]:
    base = public_feed_queryset(user)
    if not user or not user.is_authenticated:
        trending = list(base.order_by("-trending_score", "-published_at", "-pk")[: limit // 2])
        seen = {item.pk for item in trending}
        recent = list(
            base.exclude(pk__in=seen).order_by("-published_at", "-pk")[: limit - len(trending)]
        )
        return trending + recent

    result: list[Bingo] = []
    seen_ids: set[int] = set()

    following_ids = user.following_links.values_list("following_id", flat=True)
    for bingo in base.filter(author_id__in=following_ids).order_by("-published_at", "-pk")[:limit]:
        result.append(bingo)
        seen_ids.add(bingo.pk)

    recent_interactions = InteractionEvent.objects.filter(
        actor=user,
        occurred_at__gte=timezone.now() - timedelta(days=90),
        event_type__in=(
            InteractionEvent.Type.OPEN,
            InteractionEvent.Type.LIKE,
            InteractionEvent.Type.START,
            InteractionEvent.Type.COMPLETE,
            InteractionEvent.Type.TAG_INTERACTION,
        ),
    )
    interacted_tag_ids = set(
        recent_interactions.filter(tag_id__isnull=False)
        .values_list("tag_id", flat=True)
        .distinct()[:30]
    )
    interacted_bingo_ids = list(
        recent_interactions.filter(bingo_id__isnull=False)
        .values_list("bingo_id", flat=True)
        .distinct()[:200]
    )
    interacted_tag_ids.update(
        BingoTag.objects.filter(bingo_id__in=interacted_bingo_ids)
        .values_list("tag_id", flat=True)
        .distinct()[:30]
    )
    if len(result) < limit:
        for bingo in (
            base.filter(tags__id__in=interacted_tag_ids)
            .exclude(pk__in=seen_ids)
            .order_by("-trending_score", "-published_at", "-pk")
            .distinct()[: limit - len(result)]
        ):
            result.append(bingo)
            seen_ids.add(bingo.pk)

    if len(result) < limit:
        fallback = base.exclude(pk__in=seen_ids).order_by(
            "-trending_score", "-published_at", "-pk"
        )[: limit - len(result)]
        result.extend(fallback)
    return result
