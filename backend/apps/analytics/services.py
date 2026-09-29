from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db.models import Case, IntegerField, Prefetch, QuerySet, When
from django.utils import timezone

from apps.accounts.models import User
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo, BingoTag

DISCOVER_CANDIDATE_LIMIT = 240
DISCOVER_AFFINITY_DAYS = min(90, int(settings.ANALYTICS_RAW_EVENT_RETENTION_DAYS))


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


def public_feed_candidate_ids() -> QuerySet:
    """Return rankable public identifiers without hydrating card relations."""

    return Bingo.objects.public_catalog().values_list("pk", flat=True)


def _feed_hydration_queryset(user: User | None = None) -> QuerySet[Bingo]:
    """Load expensive card dependencies only after a page has been selected."""

    queryset = (
        Bingo.objects.public_catalog()
        .select_related(
            "author",
            "author__profile",
            "author__profile__avatar",
            "cover",
            "current_revision",
            "current_revision__background",
        )
        .prefetch_related(
            Prefetch(
                "tag_links",
                queryset=BingoTag.objects.select_related("tag").order_by("position"),
            ),
            "cover__derivatives",
            "current_revision__background__derivatives",
            "current_revision__cells__image",
            "current_revision__cells__image__derivatives",
            "author__profile__avatar__derivatives",
        )
    )
    if user and user.is_authenticated:
        from apps.social.models import BingoLike

        queryset = queryset.prefetch_related(
            Prefetch(
                "likes",
                queryset=BingoLike.objects.filter(user=user),
                to_attr="_viewer_likes",
            )
        )
    return queryset


def hydrate_feed_page(bingo_ids, user: User | None = None) -> list[Bingo]:
    ordered_ids = list(bingo_ids)
    if not ordered_ids:
        return []
    preserved_order = Case(
        *[When(pk=pk, then=position) for position, pk in enumerate(ordered_ids)],
        output_field=IntegerField(),
    )
    return list(_feed_hydration_queryset(user).filter(pk__in=ordered_ids).order_by(preserved_order))


def trending_feed_candidates() -> QuerySet:
    return public_feed_candidate_ids().order_by(
        "-trending_score",
        "-published_at",
        "-pk",
    )


def rank_discover_feed(
    user: User | None,
    limit: int = DISCOVER_CANDIDATE_LIMIT,
    languages: list[str] | None = None,
) -> list[int]:
    """Rank lightweight candidate ids; callers paginate before hydration."""

    base = Bingo.objects.public_catalog()
    if languages:
        base = base.filter(language__in=languages)
    if not user or not user.is_authenticated:
        trending = list(
            base.order_by("-trending_score", "-published_at", "-pk").values_list("pk", flat=True)[
                : limit // 2
            ]
        )
        seen = set(trending)
        recent = list(
            base.exclude(pk__in=seen)
            .order_by("-published_at", "-pk")
            .values_list("pk", flat=True)[: limit - len(trending)]
        )
        return trending + recent

    result: list[int] = []
    seen_ids: set[int] = set()

    following_ids = user.following_links.values_list("following_id", flat=True)
    following = (
        base.filter(author_id__in=following_ids)
        .order_by("-published_at", "-pk")
        .values_list("pk", flat=True)[:limit]
    )
    for bingo_id in following:
        result.append(bingo_id)
        seen_ids.add(bingo_id)

    recent_interactions = InteractionEvent.objects.filter(
        actor=user,
        occurred_at__gte=timezone.now() - timedelta(days=DISCOVER_AFFINITY_DAYS),
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
        matching_tags = (
            base.filter(tags__id__in=interacted_tag_ids)
            .exclude(pk__in=seen_ids)
            .order_by("-trending_score", "-published_at", "-pk")
            .values_list("pk", flat=True)
            .distinct()[: limit - len(result)]
        )
        for bingo_id in matching_tags:
            result.append(bingo_id)
            seen_ids.add(bingo_id)

    if len(result) < limit:
        fallback = (
            base.exclude(pk__in=seen_ids)
            .order_by("-trending_score", "-published_at", "-pk")
            .values_list("pk", flat=True)[: limit - len(result)]
        )
        result.extend(fallback)
    return result


def trending_feed(limit: int = 24, user: User | None = None) -> list[Bingo]:
    """Compatibility helper for non-paginated internal callers."""

    return hydrate_feed_page(trending_feed_candidates()[:limit], user)


def discover_feed(user: User | None, limit: int = 24) -> list[Bingo]:
    """Compatibility helper for non-paginated internal callers."""

    return hydrate_feed_page(rank_discover_feed(user, limit), user)
