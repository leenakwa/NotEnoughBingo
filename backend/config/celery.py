from __future__ import annotations

import logging
import os

from celery import Celery
from celery.signals import task_failure, task_retry

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("not_enough_bingo")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

logger = logging.getLogger("app.celery")


@task_retry.connect
def log_task_retry(
    *,
    request=None,
    reason=None,
    **_kwargs: object,
) -> None:
    logger.warning(
        "celery.task.retry",
        extra={
            "task_name": getattr(request, "task", ""),
            "task_id": getattr(request, "id", ""),
            "attempt": getattr(request, "retries", 0),
            "outcome": "retry",
            "exception_type": type(reason).__name__ if reason else "",
        },
    )


@task_failure.connect
def log_task_failure(
    *,
    task_id=None,
    exception=None,
    sender=None,
    **_kwargs: object,
) -> None:
    logger.error(
        "celery.task.failure",
        extra={
            "task_name": getattr(sender, "name", ""),
            "task_id": task_id or "",
            "outcome": "failure",
            "exception_type": type(exception).__name__ if exception else "",
        },
    )
