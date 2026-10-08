from __future__ import annotations

from datetime import datetime

from django.core.cache import cache
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from apps.common.tasks import BEAT_HEARTBEAT_CACHE_KEY


@never_cache
@require_GET
def live(_request):
    return JsonResponse({"status": "ok"})


@never_cache
@require_GET
def ready(_request):
    checks: dict[str, str] = {}
    status_code = 200
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
        executor = MigrationExecutor(connection)
        pending_migrations = executor.migration_plan(executor.loader.graph.leaf_nodes())
        checks["migrations"] = "pending" if pending_migrations else "ok"
        if pending_migrations:
            status_code = 503
    except Exception:
        checks["database"] = "error"
        checks["migrations"] = "unknown"
        status_code = 503
    try:
        cache.set("healthcheck", "ok", timeout=5)
        checks["cache"] = "ok" if cache.get("healthcheck") == "ok" else "error"
        if checks["cache"] == "error":
            status_code = 503
    except Exception:
        checks["cache"] = "error"
        status_code = 503
    return JsonResponse(
        {
            "status": "ok" if status_code == 200 else "degraded",
            "checks": checks,
        },
        status=status_code,
    )


@never_cache
@require_GET
def beat(_request):
    raw_observed_at = cache.get(BEAT_HEARTBEAT_CACHE_KEY)
    if not isinstance(raw_observed_at, str):
        return JsonResponse({"status": "stale", "last_seen": None}, status=503)
    try:
        observed_at = datetime.fromisoformat(raw_observed_at)
        age_seconds = max((datetime.now(observed_at.tzinfo) - observed_at).total_seconds(), 0)
    except (TypeError, ValueError):
        return JsonResponse({"status": "invalid", "last_seen": None}, status=503)
    status_code = 200 if age_seconds <= 180 else 503
    return JsonResponse(
        {
            "status": "ok" if status_code == 200 else "stale",
            "last_seen": observed_at.isoformat(),
            "age_seconds": round(age_seconds, 1),
        },
        status=status_code,
    )
