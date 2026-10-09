from __future__ import annotations

from copy import deepcopy
from unittest.mock import patch

import pytest
from django.db import transaction
from freezegun import freeze_time

from apps.bingos.models import (
    Bingo,
    BingoCell,
    BingoRevision,
    BingoRevisionTag,
    BingoTag,
    Draft,
    Tag,
)
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document
from apps.common.models import IdempotencyRecord
from apps.exports.models import ExportJob
from apps.exports.services import request_account_export, request_bingo_export

pytestmark = pytest.mark.django_db


def _new_publishable_bingo(author):
    document = empty_draft_document(title="Original publication", size=3, language="en")
    document["visibility"] = "public"
    document["description"] = "Original description"
    document["tags"] = ["original tag"]
    document["cells"][0]["text"] = "Original cell"
    return create_bingo(author=author, document=document)


def _publication_snapshot(bingo):
    return {
        "bingo": Bingo.objects.filter(pk=bingo.pk).values().get(),
        "draft": Draft.objects.filter(bingo=bingo).values().get(),
        "revisions": list(BingoRevision.objects.filter(bingo=bingo).order_by("pk").values()),
        "cells": list(BingoCell.objects.filter(revision__bingo=bingo).order_by("pk").values()),
        "revision_tags": list(
            BingoRevisionTag.objects.filter(revision__bingo=bingo).order_by("pk").values()
        ),
        "current_tags": list(BingoTag.objects.filter(bingo=bingo).order_by("pk").values()),
        "tags": list(Tag.objects.order_by("pk").values()),
        "idempotency": list(IdempotencyRecord.objects.order_by("pk").values()),
    }


@pytest.mark.parametrize("already_published", [False, True])
def test_final_publish_write_failure_rolls_back_the_complete_publication(
    verified_user_factory, already_published: bool
) -> None:
    author = verified_user_factory()
    with freeze_time("2026-10-08T10:00:00+00:00"):
        bingo = _new_publishable_bingo(author)
        if already_published:
            publish_bingo(bingo=bingo, actor=author, idempotency_key="original-publication")
    bingo.refresh_from_db()
    draft = bingo.draft
    changed = deepcopy(draft.document)
    changed.update(
        title="Changed publication",
        description="Changed description",
        language="ru",
        visibility="unlisted",
        marking_style="crossout",
        tags=["new publication tag"],
    )
    changed["cells"][0]["text"] = "Changed cell"
    save_draft(bingo=bingo, actor=author, document=changed, expected_version=draft.version)
    before = _publication_snapshot(bingo)
    save_idempotency = IdempotencyRecord.save

    def fail_final_write(instance, *args, **kwargs) -> None:
        save_idempotency(instance, *args, **kwargs)
        raise RuntimeError("Injected final publication write failure")

    with (
        freeze_time("2026-10-08T11:00:00+00:00"),
        patch.object(IdempotencyRecord, "save", fail_final_write),
        pytest.raises(RuntimeError, match="Injected final publication write failure"),
    ):
        publish_bingo(bingo=bingo, actor=author, idempotency_key="publication-to-retry")

    assert _publication_snapshot(bingo) == before
    retried = publish_bingo(bingo=bingo, actor=author, idempotency_key="publication-to-retry")
    bingo.refresh_from_db()
    draft.refresh_from_db()
    assert retried.revision_number == (2 if already_published else 1)
    assert bingo.current_revision_id == retried.pk
    assert draft.version == before["draft"]["version"] + 1
    assert draft.based_on_revision_id == retried.pk
    assert retried.cells.count() == 9
    assert list(bingo.tag_links.values_list("tag__name", flat=True)) == ["new publication tag"]


@pytest.mark.parametrize("kind", ["bingo", "account_data"])
def test_export_creation_rolls_back_without_enqueuing_and_retry_enqueues_after_commit(
    verified_user_factory, django_capture_on_commit_callbacks, kind: str
) -> None:
    author = verified_user_factory()
    bingo = _new_publishable_bingo(author)
    publish_bingo(bingo=bingo, actor=author, idempotency_key="exportable-publication")

    def request_export():
        if kind == "account_data":
            return request_account_export(author)
        return request_bingo_export(
            user=author, bingo=bingo, output_format="png", idempotency_key="export-to-retry"
        )

    with patch("apps.exports.tasks.process_export_job.delay") as enqueue:

        def fail_enclosing_transaction() -> None:
            with transaction.atomic():
                rolled_back = request_export()
                assert ExportJob.objects.filter(pk=rolled_back.pk).exists()
                enqueue.assert_not_called()
                raise RuntimeError("Injected enclosing transaction failure")

        with django_capture_on_commit_callbacks(execute=True) as rolled_back_callbacks:
            with pytest.raises(RuntimeError, match="Injected enclosing transaction failure"):
                fail_enclosing_transaction()
        assert rolled_back_callbacks == []
        assert not ExportJob.objects.filter(owner=author).exists()
        enqueue.assert_not_called()

        with django_capture_on_commit_callbacks(execute=True):
            retried = request_export()
            enqueue.assert_not_called()
        assert retried.status == "queued"
        assert ExportJob.objects.filter(pk=retried.pk).exists()
        enqueue.assert_called_once_with(retried.pk)
