"""Rehearse migrations and base query plans in a disposable QA database.

Run through the isolated development backend's ``manage.py shell`` with
NEB_QA_SCALE_ALLOWED=1. This requires database-creation privileges, creates only
synthetic disabled accounts, and removes its own temporary database on exit.
"""

import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg import sql
from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.accounts.models import User
from apps.bingos.models import Bingo, BingoRevision, BingoCell

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


def plan(queryset):
    data = json.loads(queryset.explain(analyze=True, buffers=True, format="json"))[0]
    nodes = []

    def walk(node):
        nodes.append(
            {
                k: node[k]
                for k in ("Node Type", "Index Name", "Actual Rows")
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
                password="!",
            )
            for i in range(200)
        ]
    )
    first_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
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
