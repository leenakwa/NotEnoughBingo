import json
import logging

import pytest
import sentry_sdk
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory
from sentry_sdk import Client
from sentry_sdk.transport import Transport

from apps.common.client_errors import ClientErrorView
from apps.common.error_tracking import scrub_error_event

pytestmark = pytest.mark.django_db
REPORT = {
    "kind": "exception",
    "error_type": "TypeError",
    "surface": "create",
    "frames": [{"filename": "/_next/static/chunks/app-abc.js", "lineno": 14, "colno": 8}],
}


def test_client_report_reaches_installed_sdk_without_request_or_user_data(csrf_request, caplog):
    delivered = []

    class MemoryTransport(Transport):
        def capture_envelope(self, envelope):
            delivered.extend(item.payload.json for item in envelope.items)

    client = Client(
        dsn="https://public@example.test/1",
        transport=MemoryTransport,
        default_integrations=False,
        before_send=scrub_error_event,
        environment="readiness-qa",
        release="synthetic-release",
    )
    try:
        with sentry_sdk.isolation_scope() as scope:
            scope.set_client(client)
            scope.set_user({"email": "private-marker"})
            scope.set_extra("request_body", "private-marker")
            request = csrf_request("post", "/api/v1/client-errors/", REPORT)
            with caplog.at_level(logging.INFO, logger="app.browser"):
                response = ClientErrorView.as_view()(request)
        assert response.status_code == 204
        assert len(delivered) == 1
        event = delivered[0]
        assert "private-marker" not in json.dumps(event)
        assert "request" not in event
        assert "user" not in event
        assert event["release"] == "synthetic-release"
        assert event["environment"] == "readiness-qa"
        assert event["platform"] == "javascript"
        assert event["contexts"]["browser_error"] == {"kind": "exception", "surface": "create"}
        frame = event["exception"]["values"][0]["stacktrace"]["frames"][0]
        assert frame["filename"] == REPORT["frames"][0]["filename"]
        assert frame["lineno"] == 14
        assert frame["colno"] == 8
        assert caplog.records[-1].msg == "browser.error"
    finally:
        client.close()


@pytest.mark.parametrize(
    "changes",
    [
        {"message": "private-marker"},
        {"error_type": "private-marker"},
        {"surface": "bingo/private-marker"},
        {"status_code": 600},
        {"frames": [{**REPORT["frames"][0], "vars": {"password": "private-marker"}}]},
        {"frames": [{**REPORT["frames"][0], "filename": "https://private-marker/a.js"}]},
        {"frames": [{**REPORT["frames"][0], "filename": "/_next/static/chunks/../a.js"}]},
        {"frames": [{**REPORT["frames"][0], "filename": "/_next/static/chunks/a.js?secret=x"}]},
        {"frames": REPORT["frames"] * 9},
    ],
)
def test_client_report_rejects_arbitrary_content_before_capture(csrf_request, monkeypatch, changes):
    captured = []
    monkeypatch.setattr(sentry_sdk, "capture_event", lambda event: captured.append(event))
    response = ClientErrorView.as_view()(
        csrf_request("post", "/api/v1/client-errors/", {**REPORT, **changes})
    )
    assert response.status_code == 400
    assert captured == []


def test_client_report_requires_csrf_even_without_login():
    request = APIRequestFactory(enforce_csrf_checks=True).post(
        "/api/v1/client-errors/", REPORT, format="json"
    )
    request.user = AnonymousUser()
    assert ClientErrorView.as_view()(request).status_code == 403


def test_client_reports_have_a_body_limit_and_per_client_throttle(csrf_request):
    response = ClientErrorView.as_view()(
        csrf_request("post", "/api/v1/client-errors/", {"message": "x" * 5000})
    )
    assert response.status_code == 413
    statuses = [
        ClientErrorView.as_view()(
            csrf_request("post", "/api/v1/client-errors/", REPORT)
        ).status_code
        for _ in range(20)
    ]
    assert statuses == [204] * 19 + [429]
