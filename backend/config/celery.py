from __future__ import annotations

import logging
import logging.config
import os

from celery import Celery
from celery.signals import setup_logging, task_failure, task_postrun, task_prerun, task_retry
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

app = Celery("not_enough_bingo")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

logger = logging.getLogger("app.celery")


@setup_logging.connect
def configure_worker_logging(**_kwargs: object) -> None:
    # Celery's default handlers include exception messages and task results.
    # Use the same privacy-preserving formatter for API, worker and Beat.
    logging.config.dictConfig(settings.LOGGING)


@task_prerun.connect
def log_task_started(*, task_id=None, task=None, **_kwargs: object) -> None:
    logger.info(
        "celery.task.started",
        extra={"task_name": getattr(task, "name", ""), "task_id": task_id or ""},
    )


@task_postrun.connect
def log_task_completed(*, task_id=None, task=None, state=None, **_kwargs: object) -> None:
    logger.info(
        "celery.task.completed",
        extra={
            "task_name": getattr(task, "name", ""),
            "task_id": task_id or "",
            "outcome": state or "",
        },
    )


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
