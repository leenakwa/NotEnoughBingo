from __future__ import annotations

import re

import pytest
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo, save_draft, soft_delete_bingo
from apps.bingos.validators import empty_draft_document
from apps.plays.models import PlayProgress
from apps.plays.services import (
    can_view_shared_result,
    create_shared_result,
    normalize_selected_cells,
)

pytestmark = pytest.mark.django_db


def _published():
    user = User.objects.create_user(
        username="shareauthor",
        email="share@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )
    document = empty_draft_document(title="Share test", size=3, language="en")
    document["cells"][0]["text"] = "Share this cell"
    document["visibility"] = "public"
    bingo = create_bingo(author=user, document=document)
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="share-publish-1")
    return user, bingo, revision


def test_selected_cell_ids_must_belong_to_revision() -> None:
    _, _, revision = _published()
    with pytest.raises(ValidationError):
        normalize_selected_cells(["00000000-0000-0000-0000-000000000000"], revision=revision)


@pytest.mark.parametrize("already_started", [False, True])
def test_obsolete_revision_progress_requires_an_already_started_game(already_started) -> None:
    author, bingo, first = _published()
    player = User.objects.create_user(
        username="revisionplayer",
        email="revisionplayer@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )
    client = APIClient()
    client.force_login(player)
    progress_url = f"/api/v1/progress/{bingo.public_id}/"
    first_cell_id = str(first.cells.get(position=0).public_id)
    read = client.get(progress_url)
    assert read.status_code == 200
    assert read.json()["revision_id"] == str(first.public_id)
    assert read.json()["public_id"] is None
    assert read.json()["version"] == 0
    assert read.json()["selected_cells"] == []
    assert not PlayProgress.objects.filter(user=player, bingo=bingo).exists()

    payload = {
        "revision_id": str(first.public_id),
        "selected_cells": [first_cell_id],
        "version": 0,
    }
    if already_started:
        started = client.put(progress_url, payload, format="json")
        assert started.status_code == 200
        payload["version"] = started.json()["version"]
        payload["selected_cells"] = [
            first_cell_id,
            str(first.cells.get(position=1).public_id),
        ]

    draft = bingo.draft
    draft.refresh_from_db()
    document = dict(draft.document)
    document["title"] = "Share test revision two"
    save_draft(
        bingo=bingo,
        actor=author,
        document=document,
        expected_version=draft.version,
    )
    second = publish_bingo(bingo=bingo, actor=author, idempotency_key="progress-publish-2")
    assert second.revision_number == 2
    assert second.public_id != first.public_id

    response = client.put(progress_url, payload, format="json")
    if already_started:
        assert response.status_code == 200
        assert response.json()["revision_id"] == str(first.public_id)
        assert response.json()["selected_cells"] == payload["selected_cells"]
        assert response.json()["version"] == 2
        assert response.json()["stale"] is True
        progress = PlayProgress.objects.get(user=player, bingo=bingo)
        assert progress.revision_id == first.pk
        assert progress.selected_cells == payload["selected_cells"]
    else:
        assert response.status_code == 400
        assert response.json()["error"]["details"]["revision_id"] == [
            {
                "message": "Only the current or already-started revision can be updated.",
                "code": "invalid",
            }
        ]
        assert not PlayProgress.objects.filter(user=player, bingo=bingo).exists()


def test_share_id_is_cryptographically_random_url_safe() -> None:
    user, bingo, revision = _published()
    cell_id = str(revision.cells.get(position=0).public_id)
    result = create_shared_result(
        bingo=bingo,
        revision_id=revision.public_id,
        selected_cells=[cell_id],
        display_name="Author",
        idempotency_key="share-result-one",
        actor=user,
    )
    assert len(result.share_id) >= 32
    assert re.fullmatch(r"[A-Za-z0-9_-]+", result.share_id)
    assert result.selected_cells == [cell_id]


def test_old_public_share_becomes_private_with_its_bingo(client) -> None:
    user, bingo, first = _published()
    cell_id = str(first.cells.get(position=0).public_id)
    result = create_shared_result(
        bingo=bingo,
        revision_id=first.public_id,
        selected_cells=[cell_id],
        display_name="Author",
        idempotency_key="share-before-private",
        actor=user,
    )
    share_url = f"/api/v1/shares/{bingo.public_id}/{result.share_id}/"
    assert client.get(share_url).status_code == 200
    draft = bingo.draft
    draft.refresh_from_db()
    document = dict(draft.document)
    document["visibility"] = "private"
    save_draft(
        bingo=bingo,
        actor=user,
        document=document,
        expected_version=draft.version,
    )
    publish_bingo(bingo=bingo, actor=user, idempotency_key="share-publish-private")
    bingo.refresh_from_db()
    result.bingo = bingo
    assert can_view_shared_result(result=result, user=AnonymousUser()) is False
    assert client.get(share_url).status_code == 404
    client.force_login(user)
    assert client.get(share_url).status_code == 200
    soft_delete_bingo(bingo=bingo, actor=user)
    assert client.get(share_url).status_code == 404
