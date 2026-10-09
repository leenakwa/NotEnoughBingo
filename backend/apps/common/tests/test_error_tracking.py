import json

from sentry_sdk import Client
from sentry_sdk.transport import Transport

from apps.common.error_tracking import scrub_error_event


def test_error_tracking_keeps_locations_but_removes_captured_content() -> None:
    event = {
        "event_id": "event-id",
        "environment": "staging",
        "release": "git-abc123",
        "request": {"url": "private-marker", "data": "private-marker", "headers": "private-marker"},
        "user": {"email": "private-marker"},
        "extra": {"celery_args": ["private-marker"]},
        "breadcrumbs": {"values": [{"message": "private-marker"}]},
        "logentry": {"formatted": "private-marker"},
        "contexts": {"trace": {"trace_id": "trace-id", "data": "private-marker"}},
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "private-marker",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "tasks.py",
                                "function": "process_export_job",
                                "lineno": 12,
                                "vars": {"password": "private-marker"},
                                "context_line": "private-marker",
                            }
                        ]
                    },
                }
            ]
        },
    }
    safe = scrub_error_event(event, {"request": "private-marker"})
    assert "private-marker" not in json.dumps(safe)
    assert safe["exception"]["values"][0]["type"] == "ValueError"
    assert safe["exception"]["values"][0]["stacktrace"]["frames"][0]["lineno"] == 12
    assert safe["release"] == "git-abc123"
    assert safe["contexts"]["trace"]["trace_id"] == "trace-id"


def test_transaction_tracking_keeps_timing_without_sql_or_url_payloads() -> None:
    event = {
        "type": "transaction",
        "transaction": "private-marker",
        "start_timestamp": 1,
        "timestamp": 2,
        "spans": [
            {
                "op": "db",
                "start_timestamp": 1,
                "timestamp": 2,
                "description": "private-marker",
                "data": {"sql": "private-marker"},
            }
        ],
    }
    safe = scrub_error_event(event, {})
    assert "private-marker" not in json.dumps(safe)
    assert safe["spans"][0] == {"op": "db", "start_timestamp": 1, "timestamp": 2}


def test_installed_sdk_scrubs_before_transport_without_contacting_a_provider() -> None:
    delivered = []

    class MemoryTransport(Transport):
        def capture_envelope(self, envelope):
            delivered.extend(item.payload.json for item in envelope.items)

    client = Client(
        dsn="https://public@example.test/1",
        transport=MemoryTransport,
        default_integrations=False,
        include_local_variables=False,
        max_request_body_size="never",
        before_send=scrub_error_event,
        before_send_transaction=scrub_error_event,
    )
    try:
        client.capture_event(
            {
                "message": "private-marker",
                "request": {"data": "private-marker"},
                "exception": {"values": [{"type": "ValueError", "value": "private-marker"}]},
            }
        )
        client.capture_event(
            {
                "type": "transaction",
                "transaction": "private-marker",
                "start_timestamp": 1,
                "timestamp": 2,
                "contexts": {"trace": {"trace_id": "a" * 32, "span_id": "b" * 16}},
                "spans": [{"op": "db", "description": "private-marker"}],
            }
        )
        assert len(delivered) == 2
        assert "private-marker" not in json.dumps(delivered)
        assert delivered[0]["exception"]["values"][0]["type"] == "ValueError"
    finally:
        client.close()
