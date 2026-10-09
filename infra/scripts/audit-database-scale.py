"""Rehearse migrations and base query plans in a disposable QA database.

Run through the isolated development backend's ``manage.py shell`` with
NEB_QA_SCALE_ALLOWED=1. This requires database-creation privileges, creates only
synthetic disabled accounts, and removes its own temporary database on exit.
"""

import json
import os
import secrets
import time
from datetime import UTC, datetime, timedelta

import psycopg
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management import call_command
from django.db import connection, reset_queries
from django.db.migrations.executor import MigrationExecutor
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from psycopg import sql
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User
from apps.bingos.models import Bingo, BingoCell, BingoRevision
from apps.bingos.serializers import PUBLIC_SITEMAP_BUCKET_SIZE
from apps.bingos.views import PublicSitemapIndexView, PublicSitemapView

if (
    not settings.DEBUG
    or connection.vendor != "postgresql"
    or os.environ.get("NEB_QA_SCALE_ALLOWED") != "1"
):
    raise RuntimeError(
        "This drill requires an explicitly authorized development PostgreSQL stack."
    )

if settings.DATABASE_ROUTERS:
    raise RuntimeError(
        "This drill requires a single default database without custom routers."
    )

source_name = connection.settings_dict["NAME"]
temporary_name = "neb_readiness_scale_" + secrets.token_hex(6)
admin = psycopg.connect(**connection.get_connection_params(), autocommit=True)
report = {
    "dataset": {"users": 200, "boards": 10000, "revisions": 20000, "cells": 180000},
    "queries": {},
}


def emit(stage):
    print(json.dumps({"stage": stage}), flush=True)


def summarize_plan(data):
    if isinstance(data, str):
        data = json.loads(data)
    if isinstance(data, list):
        data = data[0]
    nodes = []

    def walk(node):
        nodes.append(
            {
                k: node[k]
                for k in (
                    "Node Type",
                    "Index Name",
                    "Actual Rows",
                    "Shared Hit Blocks",
                    "Shared Read Blocks",
                    "Shared Dirtied Blocks",
                    "Shared Written Blocks",
                    "Temp Read Blocks",
                    "Temp Written Blocks",
                )
                if k in node
            }
        )
        for child in node.get("Plans", []):
            walk(child)

    walk(data["Plan"])
    return {
        "planning_ms": data["Planning Time"],
        "execution_ms": data["Execution Time"],
        "nodes": nodes,
    }


def plan(queryset):
    return summarize_plan(
        queryset.explain(analyze=True, buffers=True, format="json")
    )


def sitemap_response(view, path, query=None):
    request = APIRequestFactory().get(
        path,
        data=query or {},
        HTTP_ACCEPT="application/json",
        REMOTE_ADDR="198.51.100.25",
    )
    # Migration backfills can fill Django's bounded debug-query log. Reset it
    # before capture so saturation cannot hide this response's SELECT count.
    reset_queries()
    start = time.perf_counter()
    with CaptureQueriesContext(connection) as queries:
        response = view.as_view()(request)
        response.render()
    duration_ms = round((time.perf_counter() - start) * 1000, 3)
    assert response.status_code == 200, response.data
    assert len(queries) == 1, list(queries)
    # Capture the actual production view's SELECT instead of maintaining a
    # separate copy of its projection, bucket arithmetic, and limit clauses.
    statement = queries[0]["sql"]
    assert statement.lstrip().upper().startswith("SELECT "), statement
    with connection.cursor() as cursor:
        cursor.execute(
            sql.SQL("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {}").format(
                sql.SQL(statement)
            )
        )
        explained = cursor.fetchone()[0]
    return response.data, {
        "status_code": response.status_code,
        "query_count": len(queries),
        "json_bytes": len(response.content),
        "view_and_render_ms": duration_ms,
        "sql": statement,
        "plan": summarize_plan(explained),
    }


with admin.cursor() as cursor:
    cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(temporary_name)))
try:
    connection.close()
    connection.settings_dict["NAME"] = temporary_name
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database()")
        if cursor.fetchone()[0] != temporary_name:
            raise RuntimeError(
                "The database connection did not switch to the disposable database."
            )
    call_command("migrate", verbosity=0, interactive=False)
    users = User.objects.bulk_create(
        [
            User(
                username=f"scale_{i:04d}",
                email=f"scale_{i:04d}@example.test",
                password=make_password(None),
            )
            for i in range(200)
        ]
    )
    first_time = datetime(2026, 1, 1, tzinfo=UTC)
    last_time = first_time + timedelta(days=30)
    start = time.perf_counter()
    for offset in range(0, 10000, 1000):
        boards = Bingo.objects.bulk_create(
            [
                Bingo(
                    author=users[i % len(users)],
                    title=f"Scale stale {i:05d}",
                    size=3,
                    status="published",
                    visibility="public",
                    language="en",
                    published_at=last_time,
                    trending_score=float(i % 137),
                )
                for i in range(offset, offset + 1000)
            ],
            batch_size=500,
        )
        revisions = BingoRevision.objects.bulk_create(
            [
                BingoRevision(
                    bingo=board,
                    revision_number=number,
                    title=f"Scale current {offset + i:05d}"
                    if number == 2
                    else "Scale original",
                    size=3,
                    visibility="public",
                    marking_style="checkmark",
                    language="en",
                    document_hash="0" * 64,
                    published_by_id=board.author_id,
                    published_at=first_time if number == 1 else last_time,
                )
                for i, board in enumerate(boards)
                for number in (1, 2)
            ],
            batch_size=500,
        )
        for i, board in enumerate(boards):
            board.current_revision_id = revisions[2 * i + 1].pk
        Bingo.objects.bulk_update(boards, ("current_revision",), batch_size=500)
        BingoCell.objects.bulk_create(
            [
                BingoCell(
                    revision=revision,
                    row=position // 3,
                    column=position % 3,
                    position=position,
                    text=f"Scale cell {position}",
                )
                for revision in revisions
                for position in range(9)
            ],
            batch_size=1000,
        )
        emit(f"seeded {offset + 1000} boards")
    report["seed_seconds"] = round(time.perf_counter() - start, 3)
    executor = MigrationExecutor(connection)
    targets = executor.loader.graph.leaf_nodes()
    start = time.perf_counter()
    executor.migrate([("bingos", "0002_draftmediaasset")])
    report["downgrade_seconds"] = round(time.perf_counter() - start, 3)
    emit("old schema reached")
    start = time.perf_counter()
    MigrationExecutor(connection).migrate(targets)
    report["upgrade_seconds"] = round(time.perf_counter() - start, 3)
    report["preserved"] = {
        "users": User.objects.count(),
        "boards": Bingo.objects.count(),
        "revisions": BingoRevision.objects.count(),
        "cells": BingoCell.objects.count(),
        "original_publication": Bingo.objects.filter(published_at=first_time).count(),
        "latest_publication": Bingo.objects.filter(last_published_at=last_time).count(),
        "current_title": Bingo.objects.filter(
            title__startswith="Scale current "
        ).count(),
        "language_default": Bingo.objects.filter(language="und").count(),
        "image_alt_default": BingoCell.objects.filter(image_alt="").count(),
    }
    assert report["preserved"] == {
        "users": 200,
        "boards": 10000,
        "revisions": 20000,
        "cells": 180000,
        "original_publication": 10000,
        "latest_publication": 10000,
        "current_title": 10000,
        "language_default": 10000,
        "image_alt_default": 180000,
    }, report["preserved"]
    with connection.cursor() as cursor:
        cursor.execute("ANALYZE")
    catalog = Bingo.objects.public_catalog()
    report["queries"] = {
        "latest_page": plan(catalog.order_by("-published_at", "-pk")[:24]),
        "popular_page": plan(
            catalog.order_by("-trending_score", "-published_at", "-pk")[:24]
        ),
        "author_page": plan(
            Bingo.objects.filter(author=users[0], status="published").order_by(
                "-updated_at"
            )[:24]
        ),
        "title_contains": plan(
            catalog.filter(title__icontains="0099").order_by("-published_at", "-pk")[
                :24
            ]
        ),
    }
    # Keep the migration proof and its original 10,000-board query baseline
    # intact. Add the sitemap boundary cases only after those assertions.
    extras = Bingo.objects.bulk_create(
        [
            Bingo(
                author=users[i],
                title=f"Sitemap boundary {i}",
                size=3,
                status="published",
                visibility="public",
                language="en",
                published_at=last_time,
                last_published_at=last_time,
            )
            for i in range(2)
        ]
    )
    extra_revisions = BingoRevision.objects.bulk_create(
        [
            BingoRevision(
                bingo=board,
                revision_number=1,
                title=board.title,
                size=3,
                visibility="public",
                marking_style="checkmark",
                language="en",
                document_hash="1" * 64,
                published_by_id=board.author_id,
                published_at=last_time,
            )
            for board in extras
        ]
    )
    for board, revision in zip(extras, extra_revisions, strict=True):
        board.current_revision_id = revision.pk
    Bingo.objects.bulk_update(extras, ("current_revision",))
    expected_ids = {
        str(public_id) for public_id in Bingo.objects.values_list("public_id", flat=True)
    }
    private = Bingo.objects.order_by("pk").first()
    assert private is not None
    Bingo.objects.filter(pk=private.pk).update(visibility="private")
    expected_ids.remove(str(private.public_id))
    assert len(expected_ids) == 10001
    assert max(board.pk for board in extras) > PUBLIC_SITEMAP_BUCKET_SIZE
    with connection.cursor() as cursor:
        cursor.execute("ANALYZE")
    # The disposable SQL database must not consume the source stack's Redis
    # throttle buckets when these real API views run in-process.
    with override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": temporary_name,
            }
        }
    ):
        index, index_measurement = sitemap_response(
            PublicSitemapIndexView, "/api/v1/sitemap/bingos/index/"
        )
        assert index["parts"] == ["0", "1"], index
        parts = {}
        discovered = []
        for part in index["parts"]:
            payload, measurement = sitemap_response(
                PublicSitemapView, "/api/v1/sitemap/bingos/", {"part": part}
            )
            assert payload["truncated"] is False, {"part": part, "truncated": True}
            ids = [row["bingo_id"] for row in payload["results"]]
            start = int(part) * PUBLIC_SITEMAP_BUCKET_SIZE + 1
            expected_order = [
                str(public_id)
                for public_id in Bingo.objects.filter(
                    pk__gte=start, pk__lt=start + PUBLIC_SITEMAP_BUCKET_SIZE
                )
                .exclude(pk=private.pk)
                .order_by("pk")
                .values_list("public_id", flat=True)
            ]
            assert ids == expected_order
            assert len(ids) <= PUBLIC_SITEMAP_BUCKET_SIZE
            discovered.extend(ids)
            parts[part] = {**measurement, "boards": len(ids)}
        assert len(discovered) == len(set(discovered)) == len(expected_ids)
        assert set(discovered) == expected_ids
        assert str(private.public_id) not in discovered
        assert all(str(board.public_id) in discovered for board in extras)
    report["sitemap"] = {
        "dataset": {
            "boards": Bingo.objects.count(),
            "public_boards": len(expected_ids),
            "private_boards": 1,
            "revisions": BingoRevision.objects.count(),
            "cells": BingoCell.objects.count(),
        },
        "coverage": {
            "occupied_parts": len(index["parts"]),
            "discovered_boards": len(discovered),
            "unique_boards": len(set(discovered)),
            "omitted_boards": len(expected_ids - set(discovered)),
            "private_excluded": str(private.public_id) not in discovered,
            "extra_boards_discovered": len(extras),
        },
        "index": index_measurement,
        "parts": parts,
        "measurement_scope": (
            "One in-process DRF view and JSON-rendering sample per response on the "
            "disposable database; SQL EXPLAIN ANALYZE repeats its SELECT afterward. "
            "Excludes middleware, network, Next.js, proxy overhead, concurrent load, "
            "cold-cache guarantees, and production capacity."
        ),
    }
    emit("sitemap boundary coverage and exact API query plans verified")
    print("RESULT " + json.dumps(report), flush=True)
finally:
    connection.close()
    connection.settings_dict["NAME"] = source_name
    with admin.cursor() as cursor:
        cursor.execute(
            sql.SQL("DROP DATABASE {}").format(sql.Identifier(temporary_name))
        )
    admin.close()
    emit("temporary database removed; source database unchanged")
