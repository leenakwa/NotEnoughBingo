from __future__ import annotations

import io
import json
import uuid
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import SecurityEvent
from apps.analytics.models import InteractionEvent

pytestmark = pytest.mark.django_db


def test_page_and_cta_ingestion_is_categorical_and_idempotent() -> None:
    client = APIClient()
    event = {
        "client_event_id": str(uuid.uuid4()),
        "event_type": "page_view",
        "occurred_at": timezone.now().isoformat(),
        "anonymous_id": "privacy-browser-marker",
        "query": "private query marker",
        "metadata": {
            "surface": "register",
            "url": "private-url-marker",
            "token": "private-token-marker",
        },
    }
    assert (
        client.post("/api/v1/interactions/", {"events": [event]}, format="json").status_code == 202
    )
    assert (
        client.post("/api/v1/interactions/", {"events": [event]}, format="json").status_code == 202
    )
    saved = InteractionEvent.objects.get()
    assert saved.metadata == {"surface": "register"}
    assert saved.query == ""
    assert "marker" not in saved.anonymous_id_hash
    event.update(
        client_event_id=str(uuid.uuid4()),
        event_type="cta",
        metadata={"surface": "discover", "action": "create"},
    )
    assert (
        client.post("/api/v1/interactions/", {"events": [event]}, format="json").status_code == 202
    )
    event.update(
        client_event_id=str(uuid.uuid4()),
        metadata={"surface": "discover", "action": "private-marker"},
    )
    assert (
        client.post("/api/v1/interactions/", {"events": [event]}, format="json").status_code == 400
    )


def test_metrics_exclude_immature_cohorts_and_require_activation_before_return(
    user_factory,
    bingo_factory,
) -> None:
    now = timezone.now()
    joined = now - timedelta(days=20)
    player = user_factory(date_joined=joined)
    creator = user_factory(date_joined=joined)
    inactive = user_factory(date_joined=joined)
    recent = user_factory(date_joined=now - timedelta(days=2))
    staff = user_factory(date_joined=joined, is_staff=True)
    deleted = user_factory(date_joined=joined, deleted_at=now, is_active=False)
    bingo_factory(author=creator, published_at=joined + timedelta(days=6))
    for user, event_type, age in [
        (player, "start", 1),
        (player, "page_view", 9),
        (creator, "page_view", 3),
        (inactive, "page_view", 9),
        (recent, "start", 1),
        (staff, "start", 1),
        (deleted, "start", 1),
        (deleted, "page_view", 9),
    ]:
        InteractionEvent.objects.create(
            actor=user, event_type=event_type, occurred_at=user.date_joined + timedelta(days=age)
        )
    for _ in range(2):
        InteractionEvent.objects.create(
            event_type="page_view",
            anonymous_id_hash="browser-hash-marker",
            occurred_at=now - timedelta(days=1),
        )
    SecurityEvent.objects.create(user=player, event_type=SecurityEvent.EventType.LOGIN)
    output = io.StringIO()
    with CaptureQueriesContext(connection) as queries:
        call_command("product_metrics", days=30, stdout=output)
    result = json.loads(output.getvalue())
    assert len(queries) <= 5
    assert result["arrivals"]["anonymous_browsers"] == 1
    assert result["mature_signup_cohort"] == {
        "registered_accounts": 3,
        "activated_by_day_7": 2,
        "activated_and_returned_days_8_to_14": 1,
        "no_core_action_by_day_7": 1,
        "activated_without_return_days_8_to_14": 1,
    }
    assert result["signup_and_login_events"]["login"] == 1
    assert "marker" not in output.getvalue()
    assert player.username not in output.getvalue()
    with pytest.raises(CommandError):
        call_command("product_metrics", days=7)
