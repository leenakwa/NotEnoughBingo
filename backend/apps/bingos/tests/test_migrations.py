from __future__ import annotations

import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone
from freezegun import freeze_time

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document, normalize_draft_document


@pytest.mark.django_db(transaction=True)
def test_existing_author_and_publication_survive_schema_upgrade(monkeypatch) -> None:
    author = User.objects.create_user(
        username="migration-author",
        email="migration-author@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )
    document = empty_draft_document(title="First edition", size=3, language="en")
    document["visibility"] = "public"
    document["cells"][0]["text"] = "First cell"
    with freeze_time("2026-06-01 12:00:00+00:00"):
        bingo = create_bingo(author=author, document=normalize_draft_document(document))
        first = publish_bingo(bingo=bingo, actor=author, idempotency_key="migration-first")

    bingo.draft.refresh_from_db()
    document["title"] = "Second edition"
    save_draft(
        bingo=bingo,
        actor=author,
        document=normalize_draft_document(document),
        expected_version=bingo.draft.version,
    )
    with freeze_time("2026-07-01 12:00:00+00:00"):
        latest = publish_bingo(bingo=bingo, actor=author, idempotency_key="migration-second")

    for index in range(2):
        document["title"] = f"Another publication {index}"
        additional = create_bingo(author=author, document=normalize_draft_document(document))
        publish_bingo(
            bingo=additional,
            actor=author,
            idempotency_key=f"migration-additional-{index}",
        )

    migration = importlib.import_module("apps.bingos.migrations.0003_bingo_last_published_at")
    monkeypatch.setattr(migration, "REPAIR_BATCH_SIZE", 2)

    old_target = [("bingos", "0002_draftmediaasset")]
    current_target = [("bingos", "0005_bingocell_image_alt")]
    try:
        executor = MigrationExecutor(connection)
        executor.migrate(old_target)
        old_bingo = executor.loader.project_state(old_target).apps.get_model("bingos", "Bingo")
        old_bingo.objects.filter(pk=bingo.pk).update(
            title="Stale draft metadata",
            published_at=latest.published_at,
        )

        MigrationExecutor(connection).migrate(current_target)

        from apps.bingos.models import Bingo

        restored = Bingo.objects.get(pk=bingo.pk)
        assert restored.author_id == author.pk
        assert User.objects.filter(pk=author.pk, email=author.email).exists()
        assert restored.title == "Second edition"
        assert restored.published_at == first.published_at
        assert restored.last_published_at == latest.published_at
        assert restored.current_revision.cells.get(position=0).text == "First cell"
        assert Bingo.objects.filter(author_id=author.pk).count() == 3
    finally:
        MigrationExecutor(connection).migrate(current_target)
