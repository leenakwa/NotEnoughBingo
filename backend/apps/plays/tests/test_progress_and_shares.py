from __future__ import annotations

import re

import pytest
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document
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
    document = empty_draft_document(title="Share test", size=3)
    document["visibility"] = "public"
    bingo = create_bingo(author=user, document=document)
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="share-publish-1")
    return user, bingo, revision


def test_selected_cell_ids_must_belong_to_revision() -> None:
    _, _, revision = _published()
    with pytest.raises(ValidationError):
        normalize_selected_cells(["00000000-0000-0000-0000-000000000000"], revision=revision)


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


def test_old_public_share_remains_viewable_after_current_bingo_becomes_private() -> None:
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
    assert can_view_shared_result(result=result, user=AnonymousUser()) is True
