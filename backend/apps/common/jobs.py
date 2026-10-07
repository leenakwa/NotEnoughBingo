from __future__ import annotations

import hashlib
import logging
from functools import wraps
from typing import Any

from celery import Task, shared_task
from django.db import OperationalError, connection
from kombu.exceptions import OperationalError as BrokerOperationalError

logger = logging.getLogger("app.scheduler")


def publish_job(task: Task, job_id: int) -> bool:
    """Keep a committed job pending when its broker is temporarily unavailable."""
    try:
        task.delay(job_id)
    except BrokerOperationalError:
        logger.warning(
            "scheduled.job.publish_failed",
            extra={"task_name": task.name, "job_id": job_id, "outcome": "pending"},
        )
        return False
    return True


def job_lock_key(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], signed=True)


def periodic_task(function):
    """Prevent overlap across workers; release the database lock after a crash."""
    name = f"{function.__module__}.{function.__name__}"
    key = job_lock_key(name)

    @wraps(function)
    def run(*args, **kwargs) -> Any:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", [key])
            if not cursor.fetchone()[0]:
                logger.info(
                    "scheduled.job.skipped", extra={"task_name": name, "outcome": "overlap"}
                )
                return None
        try:
            return function(*args, **kwargs)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [key])

    return shared_task(
        ignore_result=True,
        autoretry_for=(OperationalError, OSError),
        retry_backoff=True,
        retry_jitter=True,
        max_retries=4,
    )(run)
