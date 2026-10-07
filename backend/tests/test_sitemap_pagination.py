from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bingos.models import Bingo, BingoRevision
from apps.bingos.serializers import PUBLIC_SITEMAP_MAX_PART, PUBLIC_SITEMAP_MAX_PK

pytestmark = pytest.mark.django_db


def _published_boards(author, ids: list[int]) -> list[Bingo]:
    now = timezone.now()
    boards = Bingo.objects.bulk_create(
        [
            Bingo(
                id=pk,
                author=author,
                title=f"Sitemap board {pk}",
                size=3,
                status=Bingo.Status.PUBLISHED,
                visibility=Bingo.Visibility.PUBLIC,
                published_at=now,
            )
            for pk in ids
        ]
    )
    revisions = BingoRevision.objects.bulk_create(
        [
            BingoRevision(
                bingo=board,
                revision_number=1,
                title=board.title,
                size=3,
                visibility=Bingo.Visibility.PUBLIC,
                marking_style=Bingo.MarkingStyle.CHECKMARK,
                document_hash="a" * 64,
                published_by=author,
                published_at=now,
            )
            for board in boards
        ]
    )
    for board, revision in zip(boards, revisions, strict=True):
        board.current_revision = revision
    Bingo.objects.bulk_update(boards, ["current_revision"])
    return boards


def test_sitemap_parts_cover_more_than_ten_thousand_boards_without_truncation(
    verified_user_factory, django_assert_max_num_queries
) -> None:
    boards = _published_boards(verified_user_factory(), list(range(1, 10_003)))
    client = APIClient()
    with django_assert_max_num_queries(1):
        index = client.get("/api/v1/sitemap/bingos/index/")
    assert index.status_code == 200
    assert index.data == {"parts": ["0", "1"]}
    discovered = []
    for part, expected_count in [("0", 10_000), ("1", 2)]:
        with django_assert_max_num_queries(1):
            response = client.get("/api/v1/sitemap/bingos/", {"part": part})
        assert response.status_code == 200
        assert response.data["truncated"] is False
        assert len(response.data["results"]) == expected_count
        discovered.extend(row["bingo_id"] for row in response.data["results"])
    assert discovered == [str(board.public_id) for board in boards]
    legacy = client.get("/api/v1/sitemap/bingos/")
    assert legacy.status_code == 200
    assert legacy.data["truncated"] is True
    assert len(legacy.data["results"]) == 10_000


def test_sparse_parts_and_bigint_boundaries_are_exact_and_stable(verified_user_factory) -> None:
    ids = [1, 10_000, 10_001, 30_001, 9_007_199_254_750_000, 9_007_199_254_750_001]
    ids.extend([PUBLIC_SITEMAP_MAX_PK - 1, PUBLIC_SITEMAP_MAX_PK])
    boards = _published_boards(verified_user_factory(), ids)
    client = APIClient()
    with CaptureQueriesContext(connection) as captured:
        index = client.get("/api/v1/sitemap/bingos/index/")
    assert index.status_code == 200
    expected_parts = sorted({(pk - 1) // 10_000 for pk in ids})
    assert index.data == {"parts": [str(part) for part in expected_parts]}
    assert len(captured) == 1
    assert "bingorevision" not in captured[0]["sql"]
    for part in expected_parts:
        with CaptureQueriesContext(connection) as captured:
            response = client.get("/api/v1/sitemap/bingos/", {"part": str(part)})
        assert response.data["results"] == [
            {
                "bingo_id": str(board.public_id),
                "author_username": board.author.username,
                "last_modified": response.data["results"][0]["last_modified"],
            }
            for board in boards
            if (board.pk - 1) // 10_000 == part
        ]
        assert len(captured) == 1
        assert "bingorevision" not in captured[0]["sql"]
        assert "bingocell" not in captured[0]["sql"]
        assert "OFFSET" not in captured[0]["sql"]
    Bingo.objects.filter(pk=1).update(last_published_at=timezone.now())
    assert client.get("/api/v1/sitemap/bingos/index/").data == index.data
    assert client.get("/api/v1/sitemap/bingos/", {"part": "2"}).data == {
        "results": [],
        "truncated": False,
    }


def test_sitemap_visibility_changes_apply_without_cache_clear(verified_user_factory) -> None:
    boards = _published_boards(verified_user_factory(), [1, 10_001, 20_001, 30_001, 40_001, 50_001])
    client = APIClient()
    assert len(client.get("/api/v1/sitemap/bingos/index/").data["parts"]) == 6
    assert client.get("/api/v1/sitemap/bingos/", {"part": "0"}).data["results"]
    assert len(client.get("/api/v1/sitemap/bingos/").data["results"]) == 6
    for board, changes in zip(
        boards,
        [
            {"visibility": Bingo.Visibility.PRIVATE},
            {"visibility": Bingo.Visibility.UNLISTED},
            {"status": Bingo.Status.ARCHIVED},
            {"hidden_at": timezone.now()},
            {"deleted_at": timezone.now()},
            {"current_revision": None},
        ],
        strict=True,
    ):
        Bingo.objects.filter(pk=board.pk).update(**changes)
    assert client.get("/api/v1/sitemap/bingos/index/").data == {"parts": []}
    for query in [{}, {"part": "0"}]:
        response = client.get("/api/v1/sitemap/bingos/", query)
        assert response.data == {"results": [], "truncated": False}
        assert response["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "part", ["", "00", "01", "-1", "+1", "1.0", "1e2", " 1", "1\n", "part1", "9" * 100]
)
def test_invalid_parts_are_rejected_before_querying(part, django_assert_max_num_queries) -> None:
    with django_assert_max_num_queries(0):
        response = APIClient().get("/api/v1/sitemap/bingos/", {"part": part})
    assert response.status_code == 400


def test_out_of_range_and_ambiguous_controls_are_rejected(django_assert_max_num_queries) -> None:
    client = APIClient()
    for url in [
        f"/api/v1/sitemap/bingos/?part={PUBLIC_SITEMAP_MAX_PART + 1}",
        "/api/v1/sitemap/bingos/?part=0&part=1",
        "/api/v1/sitemap/bingos/?page=1",
        "/api/v1/sitemap/bingos/?part=0&page_size=50000",
        "/api/v1/sitemap/bingos/index/?page=1",
    ]:
        with django_assert_max_num_queries(0):
            response = client.get(url)
        assert response.status_code == 400


def test_index_capacity_failure_is_explicit(verified_user_factory, monkeypatch) -> None:
    _published_boards(verified_user_factory(), [1, 30_001])
    monkeypatch.setattr("apps.bingos.views.PUBLIC_SITEMAP_MAX_PARTS", 1)
    response = APIClient().get("/api/v1/sitemap/bingos/index/")
    assert response.status_code == 503
    assert "capacity exceeded" in response.data["detail"]
    assert response["Retry-After"] == "300"
    assert "parts" not in response.data
