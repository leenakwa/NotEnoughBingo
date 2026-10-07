from __future__ import annotations

import pytest
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bingos.models import Bingo, BingoCell, BingoRevision, Draft
from apps.bingos.validators import empty_draft_document

pytestmark = pytest.mark.django_db


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _drafts(author, count: int) -> list[Draft]:
    boards = Bingo.objects.bulk_create(
        [Bingo(author=author, title=f"Draft {number}", size=3) for number in range(count)]
    )
    drafts = Draft.objects.bulk_create(
        [
            Draft(
                bingo=board,
                saved_by=author,
                document=empty_draft_document(title=board.title, size=3),
            )
            for board in boards
        ]
    )
    Draft.objects.filter(pk__in=[draft.pk for draft in drafts]).update(updated_at=timezone.now())
    return drafts


def _revisions(author, count: int) -> tuple[Bingo, list[BingoRevision]]:
    bingo = Bingo.objects.create(author=author, title="Private history", size=3)
    revisions = BingoRevision.objects.bulk_create(
        [
            BingoRevision(
                bingo=bingo,
                revision_number=number,
                title=f"Revision {number}",
                size=3,
                visibility=Bingo.Visibility.PRIVATE,
                marking_style=Bingo.MarkingStyle.CHECKMARK,
                document_hash="a" * 64,
                published_by=author,
            )
            for number in range(1, count + 1)
        ]
    )
    BingoCell.objects.bulk_create(
        [
            BingoCell(revision=revision, position=0, row=0, column=0, text=revision.title)
            for revision in revisions
        ]
    )
    return bingo, revisions


def test_drafts_are_owner_scoped_bounded_and_stably_ordered(
    user_factory, django_assert_max_num_queries
) -> None:
    owner = user_factory()
    drafts = _drafts(owner, 102)
    Bingo.objects.filter(pk=drafts[0].bingo_id).update(deleted_at=timezone.now())
    _drafts(user_factory(), 1)
    client = _client(owner)
    expected = [str(draft.public_id) for draft in reversed(drafts[1:])]

    with django_assert_max_num_queries(2):
        default = client.get("/api/v1/drafts/")
    assert default.status_code == 200
    assert default.data["count"] == 101
    assert [item["id"] for item in default.data["results"]] == expected[:24]
    assert default.data["next"] is not None
    assert default.data["previous"] is None

    first = client.get("/api/v1/drafts/", {"page_size": 1000})
    second = client.get("/api/v1/drafts/", {"page_size": 1000, "page": 2})
    assert len(first.data["results"]) == 100
    assert len(second.data["results"]) == 1
    assert [item["id"] for item in first.data["results"] + second.data["results"]] == expected
    assert second.data["next"] is None
    assert second.data["previous"] is not None
    assert client.get("/api/v1/drafts/", {"page_size": 1000, "page": 3}).status_code == 404
    # Preserve the prior absence of list search/order controls.
    assert (
        client.get("/api/v1/drafts/", {"ordering": "updated_at", "search": "missing"}).data[
            "results"
        ]
        == default.data["results"]
    )
    assert _client().get("/api/v1/drafts/").status_code == 401


def test_empty_drafts_return_an_empty_page(user_factory) -> None:
    response = _client(user_factory()).get("/api/v1/drafts/")
    assert response.status_code == 200
    assert response.data == {"count": 0, "next": None, "previous": None, "results": []}


def test_revision_pages_bound_history_and_cell_prefetches(
    user_factory, django_assert_max_num_queries
) -> None:
    owner = user_factory()
    bingo, _ = _revisions(owner, 101)
    client = _client(owner)
    path = f"/api/v1/bingos/{bingo.public_id}/revisions/"
    with django_assert_max_num_queries(5):
        default = client.get(path)
    assert default.status_code == 200
    assert default.data["count"] == 101
    assert [item["number"] for item in default.data["results"]] == list(range(101, 77, -1))
    assert default.data["results"][0]["cells"][0]["text"] == "Revision 101"
    first = client.get(path, {"page_size": 1000})
    second = client.get(path, {"page_size": 1000, "page": 2})
    assert len(first.data["results"]) == 100
    assert len(second.data["results"]) == 1
    assert [item["number"] for item in first.data["results"] + second.data["results"]] == list(
        range(101, 0, -1)
    )
    assert client.get(path, {"page_size": 1000, "page": 3}).status_code == 404
    assert _client().get(path).status_code == 401
    assert _client(user_factory()).get(path).status_code == 403
    assert (
        client.get(path, {"ordering": "revision_number"}).data["results"] == default.data["results"]
    )


def test_revision_pagination_preserves_moderator_and_deleted_board_history_access(
    user_factory,
) -> None:
    owner = user_factory()
    bingo, _ = _revisions(owner, 2)
    Bingo.objects.filter(pk=bingo.pk).update(deleted_at=timezone.now())
    moderator = user_factory(is_staff=True)
    moderator.user_permissions.add(Permission.objects.get(codename="view_private_content"))
    path = f"/api/v1/bingos/{bingo.public_id}/revisions/"
    for actor in (owner, moderator):
        response = _client(actor).get(path, {"page_size": 1})
        assert response.status_code == 200
        assert response.data["count"] == 2
        assert response.data["results"][0]["number"] == 2
    assert _client(user_factory(is_staff=True)).get(path).status_code == 403


def test_empty_revision_history_returns_an_empty_page(user_factory) -> None:
    owner = user_factory()
    bingo, _ = _revisions(owner, 0)
    response = _client(owner).get(f"/api/v1/bingos/{bingo.public_id}/revisions/")
    assert response.status_code == 200
    assert response.data == {"count": 0, "next": None, "previous": None, "results": []}
