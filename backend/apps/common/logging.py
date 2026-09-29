from __future__ import annotations

import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """Minimal JSON formatter that never serializes request bodies or headers."""

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
            "message": record.getMessage(),
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
        ):
            value = getattr(record, field, None)
            if value is not None and value != "":
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)
