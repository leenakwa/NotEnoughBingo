from __future__ import annotations

from typing import Any


def scrub_error_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Keep diagnostic locations and timing, never arbitrary captured content.

    SDK defaults alone don't remove exception messages, SQL/URL descriptions or
    application breadcrumbs. Project only the fields used for error grouping
    and latency; source code and sensitive request/task values stay local.
    """
    safe = {
        key: event[key]
        for key in (
            "event_id",
            "timestamp",
            "start_timestamp",
            "type",
            "platform",
            "level",
            "logger",
            "release",
            "environment",
            "sdk",
        )
        if key in event
    }
    trace = event.get("contexts", {}).get("trace", {})
    safe["contexts"] = {
        "trace": _select(trace, ("trace_id", "span_id", "parent_span_id", "op", "status"))
    }
    if "transaction" in event:
        safe["transaction"] = "application.operation"
    if "logentry" in event or "message" in event:
        safe["logentry"] = {"message": "application.error"}
    exceptions = []
    for exception in event.get("exception", {}).get("values", [])[-16:]:
        value = _select(exception, ("type", "module"))
        value["value"] = "Exception details omitted"
        if "stacktrace" in exception:
            value["stacktrace"] = {
                "frames": [
                    _select(frame, ("filename", "function", "module", "lineno", "in_app"))
                    for frame in exception["stacktrace"].get("frames", [])[-32:]
                ]
            }
        if "mechanism" in exception:
            value["mechanism"] = _select(exception["mechanism"], ("type", "handled"))
        exceptions.append(value)
    if exceptions:
        safe["exception"] = {"values": exceptions}
    if "spans" in event:
        safe["spans"] = [
            _select(
                span,
                (
                    "trace_id",
                    "span_id",
                    "parent_span_id",
                    "op",
                    "status",
                    "start_timestamp",
                    "timestamp",
                ),
            )
            for span in event["spans"][:100]
        ]
    return safe


def _select(value: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {key: value[key] for key in keys if key in value}
