from __future__ import annotations

from django.db import models

from apps.accounts.models import User
from apps.common.models import PublicIdModel, TimeStampedModel


class InteractionEvent(PublicIdModel):
    class Source(models.TextChoices):
        CLIENT = "client", "Client"
        SERVER = "server", "Server"

    class Type(models.TextChoices):
        IMPRESSION = "impression", "Impression"
        VIEW = "view", "View"
        OPEN = "open", "Open"
        LIKE = "like", "Like"
        UNLIKE = "unlike", "Unlike"
        START = "start", "Start"
        COMPLETE = "complete", "Complete"
        RESET = "reset", "Reset"
        SHARE = "share", "Share"
        COMMENT = "comment", "Comment"
        FOLLOW = "follow", "Follow"
        SEARCH = "search", "Search"
        TAG_INTERACTION = "tag_interaction", "Tag interaction"

    actor = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="interaction_events",
    )
    anonymous_id_hash = models.CharField(max_length=64, blank=True)
    client_event_id = models.UUIDField(null=True, blank=True, unique=True)
    source = models.CharField(
        max_length=12,
        choices=Source.choices,
        default=Source.CLIENT,
        db_index=True,
    )
    event_type = models.CharField(max_length=32, choices=Type.choices, db_index=True)
    bingo = models.ForeignKey(
        "bingos.Bingo",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="interaction_events",
    )
    revision = models.ForeignKey(
        "bingos.BingoRevision",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="interaction_events",
    )
    tag = models.ForeignKey(
        "bingos.Tag",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="interaction_events",
    )
    query = models.CharField(max_length=200, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(db_index=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at",)
        indexes = [
            models.Index(fields=("bingo", "event_type", "-occurred_at")),
            models.Index(fields=("source", "event_type", "-occurred_at")),
            models.Index(fields=("actor", "event_type", "-occurred_at")),
            models.Index(fields=("tag", "event_type", "-occurred_at")),
            models.Index(fields=("anonymous_id_hash", "-occurred_at")),
        ]


class BingoDailyMetric(TimeStampedModel):
    bingo = models.ForeignKey(
        "bingos.Bingo", on_delete=models.CASCADE, related_name="daily_metrics"
    )
    date = models.DateField()
    impressions = models.PositiveIntegerField(default=0)
    views = models.PositiveIntegerField(default=0)
    opens = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    unlikes = models.PositiveIntegerField(default=0)
    starts = models.PositiveIntegerField(default=0)
    completes = models.PositiveIntegerField(default=0)
    resets = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("bingo", "date"), name="unique_bingo_daily_metric")
        ]
        indexes = [models.Index(fields=("date", "bingo"))]
