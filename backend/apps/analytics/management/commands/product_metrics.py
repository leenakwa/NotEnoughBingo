from __future__ import annotations

import json
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from apps.accounts.models import SecurityEvent, User
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo


class Command(BaseCommand):
    help = "Read-only, aggregate product activity and mature signup-cohort metrics (no user data)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--days", type=int, default=30)

    def handle(self, *args: object, **options: object) -> None:
        days = int(options["days"])
        if not 14 <= days <= settings.ANALYTICS_RAW_EVENT_RETENTION_DAYS:
            raise CommandError("Days must be between 14 and the raw-event retention window.")
        now = timezone.now()
        cutoff = now - timedelta(days=days)
        events = InteractionEvent.objects.filter(occurred_at__gte=cutoff, occurred_at__lt=now)
        pages = events.filter(event_type=InteractionEvent.Type.PAGE_VIEW)
        arrivals = pages.aggregate(
            anonymous_browsers=Count(
                "anonymous_id_hash", distinct=True, filter=~Q(anonymous_id_hash="")
            ),
            signed_in_accounts=Count("actor_id", distinct=True),
        )
        activity = dict(
            events.values("event_type")
            .annotate(total=Count("id"))
            .values_list("event_type", "total")
        )
        security = dict(
            SecurityEvent.objects.filter(
                created_at__gte=cutoff,
                created_at__lt=now,
                event_type__in=(SecurityEvent.EventType.REGISTERED, SecurityEvent.EventType.LOGIN),
            )
            .values("event_type")
            .annotate(total=Count("id"))
            .values_list("event_type", "total")
        )
        play = InteractionEvent.objects.filter(
            actor_id=OuterRef("pk"),
            event_type=InteractionEvent.Type.START,
            occurred_at__gte=OuterRef("date_joined"),
            occurred_at__lt=OuterRef("date_joined") + timedelta(days=7),
        )
        publish = Bingo.objects.filter(
            author_id=OuterRef("pk"),
            published_at__gte=OuterRef("date_joined"),
            published_at__lt=OuterRef("date_joined") + timedelta(days=7),
        )
        returned = InteractionEvent.objects.filter(
            actor_id=OuterRef("pk"),
            event_type=InteractionEvent.Type.PAGE_VIEW,
            occurred_at__gte=OuterRef("date_joined") + timedelta(days=7),
            occurred_at__lt=OuterRef("date_joined") + timedelta(days=14),
        )
        # Exclude immature cohorts instead of mistaking users who have not had
        # fourteen days to return for churn. Staff and deleted accounts are not
        # represented as current customer accounts.
        cohort = User.objects.filter(
            date_joined__gte=cutoff,
            date_joined__lte=now - timedelta(days=14),
            deleted_at__isnull=True,
            is_staff=False,
            is_superuser=False,
        ).annotate(activated=Exists(play) | Exists(publish), returned=Exists(returned))
        funnel = cohort.aggregate(
            registered_accounts=Count("pk"),
            activated_by_day_7=Count("pk", filter=Q(activated=True)),
            activated_and_returned_days_8_to_14=Count(
                "pk", filter=Q(activated=True, returned=True)
            ),
        )
        funnel["no_core_action_by_day_7"] = (
            funnel["registered_accounts"] - funnel["activated_by_day_7"]
        )
        funnel["activated_without_return_days_8_to_14"] = (
            funnel["activated_by_day_7"] - funnel["activated_and_returned_days_8_to_14"]
        )
        result = {
            "environment": settings.APP_ENVIRONMENT,
            "window": {"start": cutoff.isoformat(), "end": now.isoformat(), "days": days},
            "arrivals": arrivals,
            "activity_events": activity,
            "signup_and_login_events": security,
            "mature_signup_cohort": funnel,
            "definitions": {
                "arrivals": (
                    "Anonymous browsers and signed-in accounts are separate estimates, "
                    "not unique people or an arrival-to-signup conversion."
                ),
                "activation": "First play start or bingo publication within seven days of signup.",
                "return": (
                    "An activated account page visit on days 8-14 after signup; "
                    "only cohorts at least fourteen days old are included."
                ),
                "limits": (
                    "Current retained accounts/events only. Deleted accounts, blocked analytics, "
                    "guest-to-account identity, and pre-instrumentation visits cannot be "
                    "reconstructed. Counts do not prove causation."
                ),
            },
        }
        self.stdout.write(json.dumps(result, sort_keys=True))
