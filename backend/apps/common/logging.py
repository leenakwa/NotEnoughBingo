from __future__ import annotations

import json
import logging
import math
import re
from datetime import UTC, datetime
from pathlib import Path

SAFE_EVENTS = {
    "app.request": {"http.request.complete"},
    "app.celery": {
        "celery.task.started",
        "celery.task.completed",
        "celery.task.retry",
        "celery.task.failure",
    },
    "apps.accounts.tasks": {"account_deletion.processing_failed"},
    "apps.exports.tasks": {"export.processing_failed"},
    "app.scheduler": {"scheduled.job.skipped", "scheduled.job.recovery_failed"},
}
SAFE_CONTEXT = re.compile(r"^[A-Za-z0-9_./:<>{}-]{1,240}$")


class JsonFormatter(logging.Formatter):
    """Log approved events and stack locations without arbitrary message data.

    Library messages, format arguments, exception text, source lines and locals
    can contain credentials or personal content. Retain their logger/severity
    and exception type/locations, but never serialize that free text.
    """

    def __init__(
        self,
        *,
        service: str = "backend",
        environment: str = "development",
        release: str = "",
    ) -> None:
        super().__init__()
        self.service = service
        self.environment = environment
        self.release = release

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": (
                record.msg
                if isinstance(record.msg, str) and record.msg in SAFE_EVENTS.get(record.name, set())
                else "log.record"
            ),
            "service": self.service,
            "environment": self.environment,
        }
        if self.release:
            payload["release"] = self.release
        for field in (
            "request_id",
            "method",
            "path",
            "route",
            "status_code",
            "duration_ms",
            "task_name",
            "task_id",
            "attempt",
            "outcome",
            "exception_type",
            "job_id",
        ):
            value = getattr(record, field, None)
            if isinstance(value, str) and SAFE_CONTEXT.fullmatch(value):
                payload[field] = value
            elif (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and (isinstance(value, int) or math.isfinite(value))
            ):
                payload[field] = value
        if record.exc_info:
            exception_class, _, traceback = record.exc_info
            payload["exception_type"] = (
                exception_class.__name__ if exception_class else "UnknownError"
            )
            frames: list[dict[str, object]] = []
            while traceback and len(frames) < 32:
                code = traceback.tb_frame.f_code
                frames.append(
                    {
                        "file": Path(code.co_filename).name,
                        "function": code.co_name,
                        "line": traceback.tb_lineno,
                    }
                )
                traceback = traceback.tb_next
            payload["exception_frames"] = frames
        return json.dumps(payload, ensure_ascii=False)
