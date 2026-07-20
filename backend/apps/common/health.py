from __future__ import annotations

from django.core.cache import cache
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


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
