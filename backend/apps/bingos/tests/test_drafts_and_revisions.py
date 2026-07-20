from __future__ import annotations

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.bingos.exceptions import DraftVersionConflict
from apps.bingos.models import BingoRevision
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document, normalize_draft_document

pytestmark = pytest.mark.django_db


def _user() -> User:
    return User.objects.create_user(
        username="author",
        email="author@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )


def _document(title: str = "A real bingo") -> dict:
    document = empty_draft_document(title=title, size=3)
    document["visibility"] = "public"
    document["cells"][0]["text"] = "First"
    return normalize_draft_document(document)


def test_draft_save_uses_optimistic_version() -> None:
    user = _user()
    bingo = create_bingo(author=user, document=_document())
    with pytest.raises(DraftVersionConflict):
        save_draft(
            bingo=bingo,
            actor=user,
            document=_document("Stale write"),
            expected_version=9,
        )
    bingo.refresh_from_db()
    assert bingo.title == "A real bingo"


def test_publish_creates_new_revision_without_mutating_old_snapshot() -> None:
    user = _user()
    bingo = create_bingo(author=user, document=_document("Version one"))
    first = publish_bingo(bingo=bingo, actor=user, idempotency_key="publish-v1")
    draft = bingo.draft
    draft.refresh_from_db()
    changed = dict(draft.document)
    changed["title"] = "Version two"
    changed["cells"] = [dict(cell) for cell in changed["cells"]]
    changed["cells"][0]["text"] = "Changed"
    save_draft(
        bingo=bingo,
        actor=user,
        document=changed,
        expected_version=draft.version,
    )
    second = publish_bingo(bingo=bingo, actor=user, idempotency_key="publish-v2")

    first.refresh_from_db()
    assert first.revision_number == 1
    assert first.title == "Version one"
    assert first.cells.get(position=0).text == "First"
    assert second.revision_number == 2
    assert second.cells.get(position=0).text == "Changed"


def test_revision_instance_rejects_update() -> None:
    user = _user()
    bingo = create_bingo(author=user, document=_document())
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="publish-lock")
    revision.title = "Mutated"
    with pytest.raises(RuntimeError, match="immutable"):
        revision.save()
    assert BingoRevision.objects.get(pk=revision.pk).title == "A real bingo"
