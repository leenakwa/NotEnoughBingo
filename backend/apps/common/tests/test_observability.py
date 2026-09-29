from __future__ import annotations

import json
import logging
from datetime import timedelta

from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from apps.common.logging import JsonFormatter
from apps.common.tasks import BEAT_HEARTBEAT_CACHE_KEY, record_beat_heartbeat


def test_request_completion_log_has_safe_correlation_fields(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = Client().get(
            "/api/v1/health/live/?token=must-not-be-logged",
            HTTP_X_REQUEST_ID="safe-request-id",
        )

    record = next(record for record in caplog.records if record.message == "http.request.complete")
    assert response.status_code == 200
    assert record.request_id == "safe-request-id"
    assert record.method == "GET"
    assert record.path == "/api/v1/health/live/"
    assert record.route == "health-live"
    assert record.status_code == 200
    assert record.duration_ms >= 0
    assert "must-not-be-logged" not in record.path


def test_json_formatter_includes_release_context_without_headers_or_body() -> None:
    formatter = JsonFormatter(
        service="worker",
        environment="staging",
        release="git-abc123",
    )
    record = logging.LogRecord(
        name="app.celery",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="celery.task.failure",
        args=(),
        exc_info=None,
    )
    record.task_name = "apps.common.tasks.example"
    record.task_id = "task-id"
    record.outcome = "failure"

    payload = json.loads(formatter.format(record))

    assert payload["service"] == "worker"
    assert payload["environment"] == "staging"
    assert payload["release"] == "git-abc123"
    assert payload["task_name"] == "apps.common.tasks.example"
    assert payload["task_id"] == "task-id"
    assert payload["outcome"] == "failure"
    assert "headers" not in payload
    assert "body" not in payload


def test_beat_health_reports_recent_and_stale_heartbeats() -> None:
    client = Client()
    cache.delete(BEAT_HEARTBEAT_CACHE_KEY)

    missing = client.get("/api/v1/health/beat/")
    record_beat_heartbeat.run()
    healthy = client.get("/api/v1/health/beat/")
    cache.set(
        BEAT_HEARTBEAT_CACHE_KEY,
        (timezone.now() - timedelta(minutes=4)).isoformat(),
        timeout=300,
    )
    stale = client.get("/api/v1/health/beat/")

    assert missing.status_code == 503
    assert healthy.status_code == 200
    assert healthy.json()["status"] == "ok"
    assert stale.status_code == 503
    assert stale.json()["status"] == "stale"
