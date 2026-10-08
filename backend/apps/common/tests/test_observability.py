from __future__ import annotations

import json
import logging
import subprocess
import sys
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest
from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from apps.common import health
from apps.common.logging import JsonFormatter
from apps.common.tasks import BEAT_HEARTBEAT_CACHE_KEY, record_beat_heartbeat


def test_installed_gunicorn_uses_safe_formatter_for_master_and_access_logs() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from gunicorn.config import Config; from gunicorn.glogging import Logger; "
            "from config.gunicorn import logconfig_dict; "
            "config = Config(); config.set('logconfig_dict', logconfig_dict); "
            "logger = Logger(config); "
            "logger.error('private-marker URL and request %s', {'token': 'private-marker'}); "
            "logger.access_log.warning('private-marker query string')",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    assert "private-marker" not in result.stdout + result.stderr
    records = [json.loads(line) for line in result.stderr.splitlines()]
    assert {record["logger"] for record in records} == {"gunicorn.error", "gunicorn.access"}
    assert all(record["message"] == "log.record" for record in records)


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


@pytest.mark.parametrize(
    "message",
    [
        "Connection to https://example.test/?token=private-marker failed",
        "Task failed with arguments %s",
    ],
)
def test_formatter_excludes_library_messages_arguments_and_exception_text(message) -> None:
    try:
        raise ValueError("private-marker from a request body")
    except ValueError:
        record = logging.LogRecord(
            name="celery.app.trace",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg=message,
            args=({"email": "private-marker@example.test"},),
            exc_info=sys.exc_info(),
        )
    record.body = "private-marker"
    record.headers = {"Authorization": "private-marker"}
    record.task_args = ["private-marker"]
    record.outcome = {"sensitive": "private-marker"}

    serialized = JsonFormatter().format(record)
    payload = json.loads(serialized)

    assert "private-marker" not in serialized
    assert payload["message"] == "log.record"
    assert payload["exception_type"] == "ValueError"
    assert payload["exception_frames"][-1]["file"] == "test_observability.py"
    assert payload["exception_frames"][-1]["line"] > 0
    assert "outcome" not in payload


@pytest.mark.django_db
def test_request_logs_route_template_instead_of_user_path_values(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        Client().get("/api/v1/profiles/private-marker/?token=private-marker")
        Client().get("/private-marker/")
    records = [record for record in caplog.records if record.msg == "http.request.complete"]
    assert len(records) == 2
    assert "private-marker" not in records[0].path
    assert records[1].path == "/unmatched"


def test_celery_lifecycle_logs_task_identity_without_arguments_or_result(caplog) -> None:
    from config.celery import log_task_completed, log_task_started

    with caplog.at_level(logging.INFO, logger="app.celery"):
        task = SimpleNamespace(name="apps.exports.tasks.process_export_job")
        log_task_started(task_id="task-id", task=task, args=["private-marker"])
        log_task_completed(task_id="task-id", task=task, state="SUCCESS", retval="private-marker")
    records = [record for record in caplog.records if record.name == "app.celery"]
    assert [record.msg for record in records] == ["celery.task.started", "celery.task.completed"]
    payloads = [json.loads(JsonFormatter().format(record)) for record in records]
    assert all(payload["task_id"] == "task-id" for payload in payloads)
    assert payloads[1]["outcome"] == "SUCCESS"
    assert "private-marker" not in json.dumps(payloads)


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


@pytest.mark.parametrize(
    ("cached_value", "failure_operation", "expected_status"),
    [
        pytest.param("ok", None, 200, id="healthy"),
        pytest.param(None, None, 503, id="missing-value"),
        pytest.param("unexpected", None, 503, id="wrong-value"),
        pytest.param("ok", "set", 503, id="write-exception"),
        pytest.param("ok", "get", 503, id="read-exception"),
    ],
)
def test_readiness_requires_successful_cache_round_trip(
    monkeypatch, cached_value, failure_operation, expected_status
) -> None:
    monkeypatch.setattr(health, "connection", MagicMock())
    executor = MagicMock()
    executor.migration_plan.return_value = []
    monkeypatch.setattr(health, "MigrationExecutor", Mock(return_value=executor))
    cache_backend = Mock()
    cache_backend.get.return_value = cached_value
    if failure_operation:
        getattr(cache_backend, failure_operation).side_effect = RuntimeError(
            "private cache connection detail"
        )
    monkeypatch.setattr(health, "cache", cache_backend)

    response = Client().get("/api/v1/health/ready/")

    assert response.status_code == expected_status
    assert response.json() == {
        "status": "ok" if expected_status == 200 else "degraded",
        "checks": {
            "database": "ok",
            "migrations": "ok",
            "cache": "ok" if expected_status == 200 else "error",
        },
    }
    cache_backend.set.assert_called_once_with("healthcheck", "ok", timeout=5)
    if failure_operation != "set":
        cache_backend.get.assert_called_once_with("healthcheck")
