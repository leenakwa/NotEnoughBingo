from __future__ import annotations

import importlib

import pytest
from django.apps import apps as django_apps
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bingos.exceptions import DraftVersionConflict
from apps.bingos.models import Bingo, BingoRevision
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document, normalize_draft_document
from apps.media_assets.models import MediaAsset
from apps.media_assets.services import asset_is_publicly_accessible

pytestmark = pytest.mark.django_db


def _user() -> User:
    return User.objects.create_user(
        username="author",
        email="author@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )


def _document(title: str = "A real bingo") -> dict:
    document = empty_draft_document(title=title, size=3, language="en")
    document["visibility"] = "public"
    document["cells"][0]["text"] = "First"
    return normalize_draft_document(document)


def _asset(*, owner: User, kind: str, name: str) -> MediaAsset:
    return MediaAsset.objects.create(
        owner=owner,
        kind=kind,
        status=MediaAsset.Status.READY,
        storage_key=f"media/tests/{name}.webp",
        expected_size=1,
    )


@pytest.mark.parametrize("value", [-0.0004, 1.0004, -1, float("nan"), float("inf"), 10**1000])
def test_opacity_rejects_out_of_range_and_nonfinite_numbers(value) -> None:
    document = empty_draft_document(title="Opacity", size=3, language="en")
    document["cells"][0]["background_opacity"] = value

    with pytest.raises(ValidationError, match="between 0 and 1"):
        normalize_draft_document(document)


def test_opacity_accepts_endpoints_and_rounds_decimal_precision() -> None:
    document = empty_draft_document(title="Opacity", size=3, language="en")
    document["cells"][0]["background_opacity"] = 0
    document["cells"][1]["background_opacity"] = 1
    document["cells"][2]["background_opacity"] = 0.4567

    normalized = normalize_draft_document(document)

    assert [normalized["cells"][index]["background_opacity"] for index in range(3)] == [
        0,
        1,
        0.457,
    ]


def test_image_only_cell_requires_description_and_publishes_accessible_name() -> None:
    user = _user()
    image = _asset(owner=user, kind=MediaAsset.Kind.CELL_IMAGE, name="image-only")
    document = empty_draft_document(title="Picture bingo", size=3, language="en")
    document["visibility"] = "public"
    document["cells"][0]["image_asset_id"] = str(image.public_id)

    with pytest.raises(ValidationError, match="Describe each image-only cell"):
        normalize_draft_document(document, require_publishable=True)

    document["cells"][0]["image_alt"] = "x" * 161
    with pytest.raises(ValidationError, match="longer than 160 characters"):
        normalize_draft_document(document)

    document["cells"][0]["image_alt"] = "A red kite over a field"
    bingo = create_bingo(author=user, document=document)
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="image-alt-publish")

    assert revision.cells.get(position=0).image_alt == "A red kite over a field"
    detail = APIClient().get(f"/api/v1/bingos/{bingo.public_id}/")
    assert detail.status_code == 200
    assert detail.data["current_revision"]["cells"][0]["image_alt"] == "A red kite over a field"


def test_draft_save_uses_optimistic_version() -> None:
    user = _user()
    bingo = create_bingo(author=user, document=_document())
    original_document = bingo.draft.document
    with pytest.raises(DraftVersionConflict):
        save_draft(
            bingo=bingo,
            actor=user,
            document=_document("Stale write"),
            expected_version=9,
        )
    bingo.refresh_from_db()
    bingo.draft.refresh_from_db()
    assert bingo.title == ""
    assert bingo.draft.document == original_document


def test_saved_draft_is_isolated_from_public_detail_feed_access_and_media() -> None:
    user = _user()
    published_cover = _asset(owner=user, kind=MediaAsset.Kind.COVER, name="published-cover")
    draft_cover = _asset(owner=user, kind=MediaAsset.Kind.COVER, name="draft-cover")
    published_background = _asset(
        owner=user,
        kind=MediaAsset.Kind.BOARD_BACKGROUND,
        name="published-background",
    )
    draft_background = _asset(
        owner=user,
        kind=MediaAsset.Kind.BOARD_BACKGROUND,
        name="draft-background",
    )
    first_document = _document("Published title")
    first_document.update(
        {
            "description": "Published description",
            "marking_style": Bingo.MarkingStyle.HIGHLIGHT,
            "marking_config": {"color": "#112233", "opacity": 0.4},
            "cover_asset_id": str(published_cover.public_id),
            "background_asset_id": str(published_background.public_id),
            "tags": ["published tag"],
        }
    )
    bingo = create_bingo(author=user, document=first_document)
    first_revision = publish_bingo(
        bingo=bingo,
        actor=user,
        idempotency_key="isolation-publish-a",
    )

    draft = bingo.draft
    draft.refresh_from_db()
    changed = empty_draft_document(title="Private draft title", size=4, language="en")
    changed.update(
        {
            "description": "Private draft description",
            "visibility": Bingo.Visibility.PRIVATE,
            "marking_style": Bingo.MarkingStyle.CROSSOUT,
            "cover_asset_id": str(draft_cover.public_id),
            "background_asset_id": str(draft_background.public_id),
            "tags": ["draft only tag"],
        }
    )
    changed["cells"][0]["text"] = "Draft-only cell"
    save_draft(
        bingo=bingo,
        actor=user,
        document=changed,
        expected_version=draft.version,
    )

    bingo.refresh_from_db()
    assert bingo.current_revision_id == first_revision.pk
    assert bingo.status == Bingo.Status.PUBLISHED
    assert bingo.visibility == Bingo.Visibility.PUBLIC
    assert bingo.title == "Published title"
    assert bingo.description == "Published description"
    assert bingo.size == 3
    assert bingo.marking_style == Bingo.MarkingStyle.HIGHLIGHT
    assert bingo.marking_config == {"color": "#112233", "opacity": 0.4}
    assert bingo.cover_id == published_cover.pk
    assert bingo.background_id == published_background.pk
    assert list(bingo.tag_links.values_list("tag__name", flat=True)) == ["published tag"]
    assert bingo.draft.document["title"] == "Private draft title"
    assert bingo.draft.document["visibility"] == Bingo.Visibility.PRIVATE

    guest = APIClient()
    detail = guest.get(f"/api/v1/bingos/{bingo.public_id}/")
    assert detail.status_code == 200
    assert detail.data["title"] == "Published title"
    assert detail.data["visibility"] == Bingo.Visibility.PUBLIC
    assert detail.data["size"] == 3
    assert detail.data["cover"]["id"] == str(published_cover.public_id)
    assert detail.data["current_revision"]["title"] == "Published title"
    assert len(detail.data["current_revision"]["cells"]) == 9
    assert detail.data["current_revision"]["cells"][0]["text"] == "First"

    feed = guest.get("/api/v1/feeds/trending/?page_size=1")
    assert feed.status_code == 200
    assert feed.data["count"] == 1
    card = feed.data["results"][0]
    assert card["title"] == "Published title"
    assert card["visibility"] == Bingo.Visibility.PUBLIC
    assert card["size"] == 3
    assert card["cover"]["id"] == str(published_cover.public_id)
    assert [tag["name"] for tag in card["tags"]] == ["published tag"]
    assert card["preview"]["size"] == 3
    assert len(card["preview"]["cells"]) == 9
    assert card["preview"]["cells"][0]["text"] == "First"

    assert asset_is_publicly_accessible(published_cover) is True
    assert asset_is_publicly_accessible(draft_cover) is False
    assert asset_is_publicly_accessible(published_background) is True
    assert asset_is_publicly_accessible(draft_background) is False


def test_public_sitemap_projection_is_visibility_scoped_and_does_not_serialize_cells(
    django_assert_max_num_queries,
) -> None:
    user = _user()
    public = create_bingo(author=user, document=_document("Indexed public bingo"))
    publish_bingo(bingo=public, actor=user, idempotency_key="sitemap-public")

    unlisted_document = _document("Unlisted bingo")
    unlisted_document["visibility"] = Bingo.Visibility.UNLISTED
    unlisted = create_bingo(author=user, document=unlisted_document)
    publish_bingo(bingo=unlisted, actor=user, idempotency_key="sitemap-unlisted")

    private_document = _document("Private bingo")
    private_document["visibility"] = Bingo.Visibility.PRIVATE
    private = create_bingo(author=user, document=private_document)
    publish_bingo(bingo=private, actor=user, idempotency_key="sitemap-private")
    create_bingo(author=user, document=_document("Unpublished draft"))

    cache.clear()
    with django_assert_max_num_queries(1):
        response = APIClient().get("/api/v1/sitemap/bingos/")

    assert response.status_code == 200
    assert response.data["truncated"] is False
    assert response.data["results"] == [
        {
            "bingo_id": str(public.public_id),
            "author_username": user.username,
            "last_modified": response.data["results"][0]["last_modified"],
        }
    ]
    assert "cells" not in str(response.data)


def test_explicit_republish_atomically_switches_snapshot_without_resetting_age() -> None:
    user = _user()
    with freeze_time("2026-07-01 12:00:00+00:00"):
        bingo = create_bingo(author=user, document=_document("Version one"))
        first = publish_bingo(
            bingo=bingo,
            actor=user,
            idempotency_key="atomic-publish-a",
        )
    first_published_at = first.published_at

    draft = bingo.draft
    draft.refresh_from_db()
    changed = empty_draft_document(title="Version two", size=4, language="en")
    changed["visibility"] = Bingo.Visibility.PUBLIC
    changed["description"] = "Second description"
    changed["tags"] = ["second tag"]
    changed["cells"][0]["text"] = "Second cell"
    save_draft(
        bingo=bingo,
        actor=user,
        document=changed,
        expected_version=draft.version,
    )

    with freeze_time("2026-08-01 12:00:00+00:00"):
        second = publish_bingo(
            bingo=bingo,
            actor=user,
            idempotency_key="atomic-publish-b",
        )

    bingo.refresh_from_db()
    assert bingo.current_revision_id == second.pk
    assert second.revision_number == 2
    assert bingo.title == second.title == "Version two"
    assert bingo.description == second.description == "Second description"
    assert bingo.size == second.size == 4
    assert second.cells.count() == 16
    assert second.cells.get(position=0).text == "Second cell"
    assert list(bingo.tag_links.values_list("tag__name", flat=True)) == ["second tag"]
    assert bingo.published_at == first_published_at
    assert bingo.last_published_at == second.published_at
    assert bingo.last_published_at > bingo.published_at

    detail = APIClient().get(f"/api/v1/bingos/{bingo.public_id}/")
    assert detail.status_code == 200
    assert detail.data["title"] == "Version two"
    assert detail.data["current_revision"]["number"] == 2
    assert detail.data["current_revision"]["cells"][0]["text"] == "Second cell"


def test_publication_migration_repairs_preexisting_draft_metadata_drift() -> None:
    user = _user()
    with freeze_time("2026-06-01 12:00:00+00:00"):
        bingo = create_bingo(author=user, document=_document("First publication"))
        first = publish_bingo(
            bingo=bingo,
            actor=user,
            idempotency_key="migration-publish-a",
        )
    draft = bingo.draft
    draft.refresh_from_db()
    second_document = _document("Current publication")
    save_draft(
        bingo=bingo,
        actor=user,
        document=second_document,
        expected_version=draft.version,
    )
    with freeze_time("2026-07-01 12:00:00+00:00"):
        current = publish_bingo(
            bingo=bingo,
            actor=user,
            idempotency_key="migration-publish-b",
        )
    Bingo.objects.filter(pk=bingo.pk).update(
        title="Leaked future draft",
        description="Leaked description",
        size=10,
        visibility=Bingo.Visibility.PRIVATE,
        published_at=current.published_at,
        last_published_at=None,
    )

    migration = importlib.import_module("apps.bingos.migrations.0003_bingo_last_published_at")
    migration.repair_published_snapshots(django_apps, None)

    bingo.refresh_from_db()
    assert bingo.title == current.title == "Current publication"
    assert bingo.description == current.description
    assert bingo.size == current.size == 3
    assert bingo.visibility == current.visibility == Bingo.Visibility.PUBLIC
    assert bingo.published_at == first.published_at
    assert bingo.last_published_at == current.published_at


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
