from __future__ import annotations

from typing import Any

BROWSER_ERROR_KINDS = ("boundary", "exception", "rejection", "api")
BROWSER_ERROR_TYPES = (
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "ApiClientError",
    "UnhandledRejection",
)
BROWSER_SURFACES = (
    "discover",
    "trending",
    "explore",
    "create",
    "profile",
    "bingo",
    "share",
    "auth",
    "support",
    "legal",
    "notifications",
    "unknown",
)


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
    browser = event.get("contexts", {}).get("browser_error", {})
    if (
        event.get("platform") == "javascript"
        and event.get("logger") == "app.browser"
        and browser.get("kind") in BROWSER_ERROR_KINDS
        and browser.get("surface") in BROWSER_SURFACES
    ):
        context = _select(browser, ("kind", "surface"))
        status_code = browser.get("status_code")
        if type(status_code) is int and 0 <= status_code <= 599:
            context["status_code"] = status_code
        safe["contexts"]["browser_error"] = context
        safe["fingerprint"] = ["{{ default }}", context["kind"], context["surface"]]
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
                    _select(frame, ("filename", "function", "module", "lineno", "colno", "in_app"))
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
