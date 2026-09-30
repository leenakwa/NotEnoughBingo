from __future__ import annotations

import copy
import io
import uuid
from datetime import UTC, datetime

import pytest
from django.conf import settings
from django.test import Client
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Follow
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo, Draft
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document
from apps.exports.models import ExportJob
from apps.media_assets.models import MediaAsset
from apps.moderation.models import ModerationAction, Report
from apps.plays.services import create_shared_result, replace_progress
from apps.social.models import Comment

pytestmark = [pytest.mark.django_db, pytest.mark.integration]


def _api_client(user=None) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    if user is not None:
        client.force_login(user)
    csrf_response = client.get("/api/v1/auth/csrf/")
    assert csrf_response.status_code == 200
    csrf_token = client.cookies[settings.CSRF_COOKIE_NAME].value
    client.credentials(HTTP_X_CSRFTOKEN=csrf_token)
    return client


def _document(*, title: str, visibility: str = Bingo.Visibility.PUBLIC) -> dict:
    document = empty_draft_document(title=title, size=3, language="en")
    document["visibility"] = visibility
    document["cells"][0]["text"] = f"{title} first cell"
    return document


def _published_bingo(*, author, title: str, visibility: str = Bingo.Visibility.PUBLIC):
    bingo = create_bingo(
        author=author,
        document=_document(title=title, visibility=visibility),
    )
    revision = publish_bingo(
        bingo=bingo,
        actor=author,
        idempotency_key=f"publish-{title.lower().replace(' ', '-')}",
    )
    bingo.refresh_from_db()
    return bingo, revision


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (24, 16), "#ffffff").save(output, format="PNG")
    return output.getvalue()


def test_bingo_api_enforces_catalog_and_direct_link_visibility(verified_user_factory) -> None:
    author = verified_user_factory(username="visibility_author")
    public, _ = _published_bingo(author=author, title="Public board")
    unlisted, _ = _published_bingo(
        author=author,
        title="Unlisted board",
        visibility=Bingo.Visibility.UNLISTED,
    )
    private, _ = _published_bingo(
        author=author,
        title="Private board",
        visibility=Bingo.Visibility.PRIVATE,
    )
    guest = _api_client()

    catalog = guest.get("/api/v1/bingos/")

    assert catalog.status_code == 200
    catalog_ids = {item["id"] for item in catalog.data["results"]}
    assert str(public.public_id) in catalog_ids
    assert str(unlisted.public_id) not in catalog_ids
    assert str(private.public_id) not in catalog_ids
    public_card = next(
        item for item in catalog.data["results"] if item["id"] == str(public.public_id)
    )
    assert public_card["preview"]["size"] == 3
    assert len(public_card["preview"]["cells"]) == 9
    assert public_card["preview"]["cells"][0]["text"] == "Public board first cell"
    assert guest.get(f"/api/v1/bingos/{public.public_id}/").status_code == 200
    assert guest.get(f"/api/v1/bingos/{unlisted.public_id}/").status_code == 200
    assert guest.get(f"/api/v1/bingos/{private.public_id}/").status_code == 404

    owner = _api_client(author)
    private_response = owner.get(f"/api/v1/bingos/{private.public_id}/")
    assert private_response.status_code == 200
    assert private_response.data["permissions"]["can_edit"] is True

    stranger = _api_client(verified_user_factory())
    assert stranger.get(f"/api/v1/bingos/{private.public_id}/").status_code == 404


def test_catalog_search_handles_unicode_literals_limits_and_pagination(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="catalogowner")
    boards = {}
    for title in ("Summer day", "Summer night", "Zebra", "Привет ☕", "100% under_score"):
        board, _ = _published_bingo(author=author, title=title)
        boards[title] = str(board.public_id)
    guest = _api_client()

    assert guest.get("/api/v1/bingos/", {"search": ""}).data["count"] == 5
    assert guest.get("/api/v1/bingos/", {"search": "   "}).data["count"] == 5
    assert guest.get("/api/v1/bingos/", {"search": "z"}).data["results"][0]["id"] == boards["Zebra"]
    assert guest.get("/api/v1/bingos/", {"search": "SUMMER"}).data["count"] == 2
    for query, title in (
        ("Привет", "Привет ☕"),
        ("☕", "Привет ☕"),
        ("%", "100% under_score"),
        ("_", "100% under_score"),
    ):
        response = guest.get("/api/v1/bingos/", {"search": query})
        assert response.status_code == 200
        assert [item["id"] for item in response.data["results"]] == [boards[title]], query
    assert guest.get("/api/v1/bingos/", {"search": "no-match-typo"}).data["count"] == 0

    first_page = guest.get("/api/v1/bingos/", {"page_size": 2})
    assert first_page.data["count"] == 5
    assert len(first_page.data["results"]) == 2
    assert first_page.data["next"] is not None
    assert guest.get("/api/v1/bingos/", {"page_size": 2, "page": 3}).data["count"] == 5

    Bingo.objects.filter(public_id=boards["Summer day"]).update(trending_score=10)
    newest = guest.get("/api/v1/bingos/", {"search": "Summer", "ordering": "newest"})
    popular = guest.get(
        "/api/v1/bingos/",
        {"search": "Summer", "author": "catalogowner", "ordering": "popular"},
    )
    assert [item["id"] for item in newest.data["results"]] == [
        boards["Summer night"],
        boards["Summer day"],
    ]
    assert [item["id"] for item in popular.data["results"]] == [
        boards["Summer day"],
        boards["Summer night"],
    ]
    assert guest.get("/api/v1/bingos/", {"author": "nobody"}).data["count"] == 0
    assert guest.get("/api/v1/bingos/", {"search": "x" * 81}).status_code == 400
    assert guest.get("/api/v1/bingos/", {"author": "x" * 81}).status_code == 400


def test_catalog_orders_real_instants_and_serializes_calendar_boundaries(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="dateboundaryowner")
    boundaries = (
        ("Leap day", datetime(2024, 2, 29, 23, 59, tzinfo=UTC)),
        ("March start", datetime(2024, 3, 1, 0, 1, tzinfo=UTC)),
        ("Year end", datetime(2024, 12, 31, 23, 59, tzinfo=UTC)),
        ("New year", datetime(2025, 1, 1, 0, 1, tzinfo=UTC)),
    )
    expected = {}
    for title, instant in boundaries:
        bingo, _ = _published_bingo(author=author, title=f"Boundary {title}")
        Bingo.objects.filter(pk=bingo.pk).update(published_at=instant)
        expected[title] = (str(bingo.public_id), instant)

    response = _api_client().get("/api/v1/bingos/", {"search": "Boundary", "ordering": "newest"})

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [
        expected[title][0] for title in ("New year", "Year end", "March start", "Leap day")
    ]
    for item in response.data["results"]:
        expected_instant = next(
            instant for public_id, instant in expected.values() if public_id == item["id"]
        )
        assert datetime.fromisoformat(item["published_at"]).astimezone(UTC) == expected_instant


def test_direct_urls_and_spoofed_role_cannot_change_another_users_bingo(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="access_author")
    stranger = verified_user_factory(username="access_stranger")
    public, _ = _published_bingo(author=author, title="Access public board")
    private, _ = _published_bingo(
        author=author,
        title="Access private board",
        visibility=Bingo.Visibility.PRIVATE,
    )
    client = _api_client(stranger)

    assert client.get(f"/api/v1/bingos/{private.public_id}/").status_code == 404
    assert client.get(f"/api/v1/bingos/{private.public_id}/draft/").status_code == 404
    assert (
        client.put(
            f"/api/v1/bingos/{private.public_id}/draft/",
            _document(title="Stolen board"),
            format="json",
            HTTP_IF_MATCH='"draft-1"',
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/bingos/{private.public_id}/publish/",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY="spoofed-publish",
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/bingos/{private.public_id}/").status_code == 404
    assert client.delete(f"/api/v1/bingos/{public.public_id}/").status_code == 403
    assert (
        Bingo.objects.filter(pk__in=(public.pk, private.pk), deleted_at__isnull=True).count() == 2
    )

    moderation = client.get(
        "/api/v1/moderation/reports/?role=moderator",
        HTTP_X_ROLE="moderator",
        HTTP_X_IS_STAFF="true",
    )
    assert moderation.status_code == 403
    stranger.refresh_from_db()
    assert stranger.is_staff is False

    browser = Client()
    browser.force_login(stranger)
    for path in ("/admin/", "/admin/accounts/user/"):
        response = browser.get(path)
        assert response.status_code == 302
        assert "/admin/login/" in response["Location"]


def test_tag_catalog_only_exposes_tags_used_by_public_bingos(verified_user_factory) -> None:
    author = verified_user_factory(username="tag_catalog_author")
    public_document = _document(title="Public tag board")
    public_document["tags"] = ["Visible topic"]
    public_bingo = create_bingo(author=author, document=public_document)
    publish_bingo(
        bingo=public_bingo,
        actor=author,
        idempotency_key="publish-public-tag-board",
    )

    for visibility, title, tag in (
        (Bingo.Visibility.UNLISTED, "Unlisted tag board", "Unlisted secret"),
        (Bingo.Visibility.PRIVATE, "Private tag board", "Private secret"),
    ):
        document = _document(title=title, visibility=visibility)
        document["tags"] = [tag]
        bingo = create_bingo(author=author, document=document)
        publish_bingo(
            bingo=bingo,
            actor=author,
            idempotency_key=f"publish-{visibility}-tag-board",
        )

    client = _api_client()
    response = client.get("/api/v1/tags/")

    assert response.status_code == 200
    assert [(item["name"], item["usage_count"]) for item in response.data["results"]] == [
        ("visible topic", 1)
    ]
    assert client.get("/api/v1/tags/?search=visible").data["count"] == 1
    assert client.get("/api/v1/tags/?search=secret").data["count"] == 0


def test_author_suggestions_are_public_catalog_scoped_and_privacy_minimal(
    verified_user_factory,
) -> None:
    alpha = verified_user_factory(username="alpha_catalog")
    alpha.profile.display_name = "Alpha Maker"
    alpha.profile.save(update_fields=["display_name"])
    _published_bingo(author=alpha, title="Alpha public board")

    zeta = verified_user_factory(username="zeta_catalog")
    zeta.profile.display_name = "Zed Display"
    zeta.profile.save(update_fields=["display_name"])
    _published_bingo(author=zeta, title="Zeta public board")

    draft_only = verified_user_factory(username="draft_catalog")
    create_bingo(author=draft_only, document=_document(title="Draft only"))

    unlisted = verified_user_factory(username="unlisted_catalog")
    _published_bingo(
        author=unlisted,
        title="Unlisted only",
        visibility=Bingo.Visibility.UNLISTED,
    )

    hidden = verified_user_factory(username="hidden_catalog")
    hidden_bingo, _ = _published_bingo(author=hidden, title="Hidden public board")
    hidden_bingo.hidden_at = timezone.now()
    hidden_bingo.save(update_fields=["hidden_at"])

    deleted_bingo_author = verified_user_factory(username="deleted_bingo_catalog")
    deleted_bingo, _ = _published_bingo(
        author=deleted_bingo_author,
        title="Deleted public board",
    )
    deleted_bingo.deleted_at = timezone.now()
    deleted_bingo.save(update_fields=["deleted_at"])

    for username, field in (
        ("suspended_catalog", "suspended_at"),
        ("deleted_user_catalog", "deleted_at"),
    ):
        author = verified_user_factory(username=username)
        _published_bingo(author=author, title=f"{username} public board")
        setattr(author, field, timezone.now())
        author.save(update_fields=[field])

    inactive = verified_user_factory(username="inactive_catalog")
    _published_bingo(author=inactive, title="Inactive public board")
    inactive.is_active = False
    inactive.save(update_fields=["is_active"])

    client = _api_client()
    assert client.get(f"/api/v1/bingos/{deleted_bingo.public_id}/").status_code == 404
    response = client.get("/api/v1/authors/?search=catalog")

    assert response.status_code == 200
    assert [item["username"] for item in response.data["results"]] == [
        "alpha_catalog",
        "zeta_catalog",
    ]
    assert all(set(item) == {"id", "username", "display_name"} for item in response.data["results"])
    assert client.get("/api/v1/authors/?search=zed").data["results"][0]["username"] == (
        "zeta_catalog"
    )
    assert client.get(f"/api/v1/authors/?search={'x' * 81}").status_code == 400


def test_author_suggestion_page_size_is_capped(verified_user_factory) -> None:
    for index in range(11):
        author = verified_user_factory(username=f"bounded_author_{index:02d}")
        _published_bingo(author=author, title=f"Bounded public board {index}")

    response = _api_client().get("/api/v1/authors/?search=bounded&page_size=999")

    assert response.status_code == 200
    assert response.data["count"] == 11
    assert len(response.data["results"]) == 10
    assert [item["username"] for item in response.data["results"]] == [
        f"bounded_author_{index:02d}" for index in range(10)
    ]


def test_bingo_create_publish_and_revision_api_preserves_old_snapshot(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="api_author")
    client = _api_client(author)
    first_document = _document(title="API version one")

    created = client.post("/api/v1/bingos/", first_document, format="json")

    assert created.status_code == 201
    bingo_id = created.data["id"]
    first_publish = client.post(
        f"/api/v1/bingos/{bingo_id}/publish/",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="publish-api-version-one",
    )
    duplicate_publish = client.post(
        f"/api/v1/bingos/{bingo_id}/publish/",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="publish-api-version-one",
    )
    assert first_publish.status_code == duplicate_publish.status_code == 201
    assert first_publish.data["current_revision"]["number"] == 1
    assert (
        duplicate_publish.data["current_revision"]["id"]
        == first_publish.data["current_revision"]["id"]
    )

    draft_response = client.get(f"/api/v1/bingos/{bingo_id}/draft/")
    assert draft_response.status_code == 200
    changed = copy.deepcopy(Draft.objects.get(bingo__public_id=bingo_id).document)
    changed["title"] = "API version two"
    changed["cells"][0]["text"] = "Changed in version two"
    saved = client.put(
        f"/api/v1/bingos/{bingo_id}/draft/",
        changed,
        format="json",
        HTTP_IF_MATCH=draft_response["ETag"],
    )
    assert saved.status_code == 200
    second_publish = client.post(
        f"/api/v1/bingos/{bingo_id}/publish/",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="publish-api-version-two",
    )
    assert second_publish.status_code == 201
    assert second_publish.data["current_revision"]["number"] == 2

    revisions = client.get(f"/api/v1/bingos/{bingo_id}/revisions/")
    assert revisions.status_code == 200
    assert [item["number"] for item in revisions.data] == [2, 1]
    assert revisions.data[1]["title"] == "API version one"
    assert revisions.data[1]["cells"][0]["text"] == "API version one first cell"


def test_unverified_user_cannot_create_bingo(user_factory) -> None:
    user = user_factory()
    client = _api_client(user)

    response = client.post(
        "/api/v1/bingos/",
        _document(title="Forbidden draft"),
        format="json",
    )

    assert response.status_code == 403
    assert not Bingo.objects.filter(author=user).exists()


def test_registered_progress_and_guest_share_routes_keep_immutable_revision_snapshot(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="play_author")
    player = verified_user_factory(username="registered_player")
    bingo, first_revision = _published_bingo(author=author, title="Snapshot one")
    first_cell_id = str(first_revision.cells.get(position=0).public_id)

    player_client = _api_client(player)
    progress_url = f"/api/v1/progress/{bingo.public_id}/"
    saved_progress = player_client.put(
        progress_url,
        {"selected_cells": [first_cell_id], "version": 0},
        format="json",
    )
    assert saved_progress.status_code == 200
    assert saved_progress.data["selected_cells"] == [first_cell_id]
    assert player_client.delete(progress_url).status_code == 204
    reset_progress = player_client.get(progress_url)
    assert reset_progress.status_code == 200
    assert reset_progress.data["selected_cells"] == []
    assert reset_progress.data["reset_at"] is not None

    guest = _api_client()
    assert guest.get(progress_url).status_code == 403
    share_created = guest.post(
        f"/api/v1/bingos/{bingo.public_id}/shares/",
        {"selected_cells": [first_cell_id], "display_name": "Guest player"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="guest-share-snapshot-one",
    )
    assert share_created.status_code == 201
    assert share_created.data["read_only"] is True
    share_id = share_created.data["id"]

    draft = bingo.draft
    draft.refresh_from_db()
    changed = copy.deepcopy(draft.document)
    changed["title"] = "Snapshot two"
    save_draft(
        bingo=bingo,
        actor=author,
        document=changed,
        expected_version=draft.version,
    )
    publish_bingo(
        bingo=bingo,
        actor=author,
        idempotency_key="publish-snapshot-two",
    )
    bingo.refresh_from_db()
    assert bingo.current_revision.revision_number == 2

    share_url = f"/api/v1/shares/{bingo.public_id}/{share_id}/"
    shared = guest.get(share_url)
    assert shared.status_code == 200
    assert shared.data["read_only"] is True
    assert shared.data["selected_cells"] == [first_cell_id]
    assert shared.data["revision"]["number"] == 1
    assert shared.data["revision"]["title"] == "Snapshot one"
    assert guest.patch(share_url, {"selected_cells": []}, format="json").status_code == 405


def test_private_shared_result_is_owner_only(verified_user_factory) -> None:
    author = verified_user_factory(username="private_share_author")
    bingo, revision = _published_bingo(
        author=author,
        title="Private share",
        visibility=Bingo.Visibility.PRIVATE,
    )
    cell_id = str(revision.cells.get(position=0).public_id)
    owner_client = _api_client(author)
    created = owner_client.post(
        f"/api/v1/bingos/{bingo.public_id}/shares/",
        {"selected_cells": [cell_id]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="private-owner-share",
    )
    assert created.status_code == 201
    assert created.data["access"] == "owner_only"
    share_url = f"/api/v1/shares/{bingo.public_id}/{created.data['id']}/"

    assert _api_client().get(share_url).status_code == 404
    assert owner_client.get(share_url).status_code == 200


def test_upload_intent_content_and_complete_are_owner_scoped(
    user_factory,
    verified_user_factory,
) -> None:
    owner = verified_user_factory(username="upload_owner")
    other = verified_user_factory(username="upload_other")
    data = _png_bytes()
    owner_client = _api_client(owner)
    intent = owner_client.post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.png",
            "content_type": "image/png",
            "size": len(data),
        },
        format="json",
    )
    assert intent.status_code == 201
    asset_id = intent.data["asset_id"]
    assert intent.data["method"] == "PUT"

    other_client = _api_client(other)
    complete_url = f"/api/v1/uploads/{asset_id}/complete/"
    assert other_client.post(complete_url, {}, format="json").status_code == 404

    uploaded = owner_client.put(
        intent.data["upload_url"],
        data,
        content_type="image/png",
    )
    assert uploaded.status_code == 202
    assert uploaded.data["status"] == MediaAsset.Status.UPLOADED
    completed = owner_client.post(complete_url, {}, format="json")
    assert completed.status_code == 202
    assert completed.data["status"] == MediaAsset.Status.PROCESSING
    assert MediaAsset.objects.get(public_id=asset_id).owner == owner

    unverified = user_factory(username="unverified_uploader")
    denied = _api_client(unverified).post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.png",
            "content_type": "image/png",
            "size": len(data),
        },
        format="json",
    )
    assert denied.status_code == 403


def test_upload_rejection_has_actionable_message(verified_user_factory) -> None:
    owner = verified_user_factory(username="upload_error_owner")
    client = _api_client(owner)
    response = client.post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.jpg",
            "content_type": "image/png",
            "size": len(_png_bytes()),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["details"]["file"] == {
        "message": "The filename extension does not match the image type.",
        "code": "invalid",
    }

    oversized = client.post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.png",
            "content_type": "image/png",
            "size": 13 * 1024 * 1024,
        },
        format="json",
    )
    assert oversized.status_code == 400
    assert oversized.data["error"]["details"]["file"]["message"] == (
        "The image is empty or exceeds the upload size limit."
    )

    intent = client.post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.png",
            "content_type": "image/png",
            "size": len(_png_bytes()),
        },
        format="json",
    )
    assert intent.status_code == 201
    MediaAsset.objects.filter(public_id=intent.data["asset_id"]).update(
        status=MediaAsset.Status.REJECTED,
        rejection_reason="invalid_image",
    )
    detail = client.get(f"/api/v1/uploads/{intent.data['asset_id']}/")
    assert detail.status_code == 200
    assert detail.data["rejection_reason"] == (
        "This file could not be read as an image. Choose another image."
    )


def test_export_api_is_author_only_idempotent_and_owner_scoped(verified_user_factory) -> None:
    author = verified_user_factory(username="export_api_author")
    other = verified_user_factory(username="export_api_other")
    bingo, revision = _published_bingo(author=author, title="Export API board")
    author_client = _api_client(author)
    create_url = f"/api/v1/bingos/{bingo.public_id}/exports/"

    first = author_client.post(
        create_url,
        {"format": "png"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="export-api-png-one",
    )
    second = author_client.post(
        create_url,
        {"format": "png"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="export-api-png-one",
    )
    assert first.status_code == second.status_code == 202
    assert first.data["id"] == second.data["id"]
    assert first.data["status"] == ExportJob.Status.QUEUED
    job = ExportJob.objects.get(public_id=first.data["id"])
    assert job.owner == author
    assert job.revision == revision

    detail_url = f"/api/v1/exports/{job.public_id}/"
    assert author_client.get(detail_url).status_code == 200
    other_client = _api_client(other)
    assert other_client.get(detail_url).status_code == 404
    assert (
        other_client.post(
            create_url,
            {"format": "pdf"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="export-other-user",
        ).status_code
        == 404
    )


def test_social_routes_enforce_ownership_depth_likes_follows_and_notifications(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="social_author")
    commenter = verified_user_factory(username="social_commenter")
    replier = verified_user_factory(username="social_replier")
    bingo, _ = _published_bingo(author=author, title="Social API board")
    commenter_client = _api_client(commenter)
    replier_client = _api_client(replier)
    comments_url = f"/api/v1/bingos/{bingo.public_id}/comments/"

    root = commenter_client.post(comments_url, {"body": "Root comment"}, format="json")
    assert root.status_code == 201
    root_id = root.data["id"]
    reply = replier_client.post(
        f"/api/v1/comments/{root_id}/replies/",
        {"body": "One-level reply"},
        format="json",
    )
    assert reply.status_code == 201
    reply_id = reply.data["id"]
    nested = commenter_client.post(
        f"/api/v1/comments/{reply_id}/replies/",
        {"body": "Forbidden nested reply"},
        format="json",
    )
    assert nested.status_code == 404

    assert replier_client.post(f"/api/v1/bingos/{bingo.public_id}/likes/").status_code == 201
    assert replier_client.post(f"/api/v1/comments/{root_id}/likes/").status_code == 201
    bingo.refresh_from_db()
    assert bingo.like_count == 1
    root_comment = Comment.objects.get(public_id=root_id)
    assert root_comment.like_count == 1
    assert root_comment.reply_count == 1

    forbidden_edit = replier_client.patch(
        f"/api/v1/comments/{root_id}/",
        {"body": "Hijacked"},
        format="json",
    )
    assert forbidden_edit.status_code == 403
    edited = commenter_client.patch(
        f"/api/v1/comments/{root_id}/",
        {"body": "Edited by owner"},
        format="json",
    )
    assert edited.status_code == 200
    assert edited.data["body"] == "Edited by owner"

    follow_url = f"/api/v1/users/{author.public_id}/followers/"
    assert commenter_client.post(follow_url).status_code == 201
    assert commenter_client.post(follow_url).status_code == 200

    author_client = _api_client(author)
    unread = author_client.get("/api/v1/notifications/unread-count/")
    assert unread.status_code == 200
    assert unread.data["count"] == 3
    notifications = author_client.get("/api/v1/notifications/")
    assert notifications.status_code == 200
    kinds = {item["kind"] for item in notifications.data["results"]}
    assert {"bingo_comment", "bingo_like", "new_follower"}.issubset(kinds)
    first_notification = notifications.data["results"][0]
    marked = author_client.post(f"/api/v1/notifications/{first_notification['id']}/read/")
    assert marked.status_code == 200
    assert marked.data["is_read"] is True
    marked_all = author_client.post("/api/v1/notifications/read-all/")
    assert marked_all.status_code == 200
    assert author_client.get("/api/v1/notifications/unread-count/").data["count"] == 0

    assert commenter_client.delete(f"/api/v1/comments/{root_id}/").status_code == 204
    guest_thread = _api_client().get(comments_url)
    assert guest_thread.status_code == 200
    deleted_root = next(item for item in guest_thread.data["results"] if item["id"] == root_id)
    assert deleted_root["body"] == "[deleted]"
    assert deleted_root["replies"][0]["id"] == reply_id


def test_report_and_moderation_api_permissions_and_audit(verified_user_factory) -> None:
    from django.contrib.auth.models import Permission

    author = verified_user_factory(username="reported_board_author")
    reporter = verified_user_factory(username="api_reporter")
    moderator = verified_user_factory(username="api_moderator", is_staff=True)
    moderator.user_permissions.add(
        Permission.objects.get(codename="moderate_content"),
        Permission.objects.get(codename="view_private_content"),
    )
    bingo, _ = _published_bingo(author=author, title="Moderated API board")
    reporter_client = _api_client(reporter)

    created = reporter_client.post(
        "/api/v1/reports/",
        {
            "target_type": "bingo",
            "target_id": str(bingo.public_id),
            "reason": "spam",
            "description": "Promotional spam",
        },
        format="json",
    )
    duplicate = reporter_client.post(
        "/api/v1/reports/",
        {
            "target_type": "bingo",
            "target_id": str(bingo.public_id),
            "reason": "other",
            "description": "Duplicate active report",
        },
        format="json",
    )
    assert created.status_code == duplicate.status_code == 201
    assert duplicate.data["report_id"] == created.data["report_id"]
    assert reporter_client.get("/api/v1/moderation/reports/").status_code == 403

    moderator_client = _api_client(moderator)
    queue = moderator_client.get("/api/v1/moderation/reports/?status=open")
    assert queue.status_code == 200
    assert queue.data["count"] == 1
    action = moderator_client.post(
        f"/api/v1/moderation/reports/{created.data['report_id']}/actions/",
        {"action": "hide", "reason": "Confirmed spam"},
        format="json",
    )
    assert action.status_code == 201
    assert action.data["action"] == ModerationAction.Action.HIDE
    bingo.refresh_from_db()
    report = Report.objects.get(public_id=created.data["report_id"])
    assert bingo.hidden_at is not None
    assert report.status == Report.Status.RESOLVED
    assert report.actions.filter(moderator=moderator).count() == 1
    detail = moderator_client.get(f"/api/v1/moderation/reports/{report.public_id}/")
    assert detail.status_code == 200
    assert len(detail.data["status_history"]) == 2


def test_interaction_and_feed_api_validate_guest_events_and_public_content(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="feed_author")
    public, revision = _published_bingo(author=author, title="Feed public")
    _published_bingo(
        author=author,
        title="Feed unlisted",
        visibility=Bingo.Visibility.UNLISTED,
    )
    Bingo.objects.filter(pk=public.pk).update(trending_score=20)
    guest = _api_client()
    event_id = uuid.uuid4()
    payload = {
        "events": [
            {
                "client_event_id": str(event_id),
                "event_type": "open",
                "bingo_id": str(public.public_id),
                "revision_id": str(revision.public_id),
                "occurred_at": timezone.now().isoformat(),
                "anonymous_id": "browser-session-123",
                "metadata": {"surface": "explore"},
            }
        ]
    }

    accepted = guest.post("/api/v1/interactions/", payload, format="json")
    repeated = guest.post("/api/v1/interactions/", payload, format="json")
    assert accepted.status_code == repeated.status_code == 202
    assert accepted.data == repeated.data == {"accepted": 1}
    assert InteractionEvent.objects.filter(client_event_id=event_id).count() == 1

    conflicting_payload = copy.deepcopy(payload)
    conflicting_payload["events"][0]["event_type"] = "view"
    conflict = guest.post("/api/v1/interactions/", conflicting_payload, format="json")
    assert conflict.status_code == 400
    assert InteractionEvent.objects.filter(client_event_id=event_id).count() == 1

    forbidden = guest.post(
        "/api/v1/interactions/",
        {
            "events": [
                {
                    "event_type": "like",
                    "bingo_id": str(public.public_id),
                    "occurred_at": timezone.now().isoformat(),
                    "anonymous_id": "browser-session-123",
                    "metadata": {},
                }
            ]
        },
        format="json",
    )
    assert forbidden.status_code == 400

    search_event_id = uuid.uuid4()
    sensitive_search = guest.post(
        "/api/v1/interactions/",
        {
            "events": [
                {
                    "client_event_id": str(search_event_id),
                    "event_type": "search",
                    "query": "someone@example.test private phrase",
                    "occurred_at": timezone.now().isoformat(),
                    "anonymous_id": "browser-session-123",
                    "metadata": {
                        "surface": "explore",
                        "author": "someone@example.test",
                        "tags": "private phrase",
                        "ordering": "newest",
                    },
                }
            ]
        },
        format="json",
    )
    assert sensitive_search.status_code == 202
    stored_search = InteractionEvent.objects.get(client_event_id=search_event_id)
    assert stored_search.query == ""
    assert stored_search.metadata == {"surface": "explore", "ordering": "newest"}

    trending = guest.get("/api/v1/feeds/trending/")
    discover = guest.get("/api/v1/feeds/discover/")
    assert trending.status_code == discover.status_code == 200
    trending_ids = {item["id"] for item in trending.data["results"]}
    discover_ids = {item["id"] for item in discover.data["results"]}
    assert str(public.public_id) in trending_ids
    assert str(public.public_id) in discover_ids
    assert all(item["visibility"] == Bingo.Visibility.PUBLIC for item in trending.data["results"])
    assert all(item["visibility"] == Bingo.Visibility.PUBLIC for item in discover.data["results"])


def test_profile_subresources_apply_independent_privacy_and_visibility(
    verified_user_factory,
) -> None:
    profile_user = verified_user_factory(username="profile_subject")
    other_author = verified_user_factory(username="profile_other_author")
    follower = verified_user_factory(username="profile_follower")
    created_public, _ = _published_bingo(
        author=profile_user,
        title="Profile public board",
    )
    _published_bingo(
        author=profile_user,
        title="Profile unlisted board",
        visibility=Bingo.Visibility.UNLISTED,
    )
    draft_document = _document(
        title="Profile private draft",
        visibility=Bingo.Visibility.PRIVATE,
    )
    draft_document["description"] = "Only the creator can see this saved draft."
    draft_document["tags"] = ["Work in progress"]
    draft_bingo = create_bingo(author=profile_user, document=draft_document)
    played_bingo, played_revision = _published_bingo(
        author=other_author,
        title="Profile played board",
    )
    selected_id = str(played_revision.cells.order_by("position").first().public_id)
    replace_progress(
        user=profile_user,
        bingo=played_bingo,
        selected_cells=[selected_id],
        expected_version=0,
    )
    create_shared_result(
        bingo=played_bingo,
        selected_cells=[selected_id],
        display_name="Profile Subject",
        idempotency_key="profile-shared-result",
        actor=profile_user,
    )
    Follow.objects.create(follower=follower, following=profile_user)
    Follow.objects.create(follower=profile_user, following=other_author)

    guest = _api_client()
    base = "/api/v1/profiles/profile_subject"
    bingos = guest.get(f"{base}/bingos/")
    history = guest.get(f"{base}/play-history/")
    shares = guest.get(f"{base}/shared-results/")
    followers = guest.get(f"{base}/followers/")
    following = guest.get(f"{base}/following/")

    assert {
        response.status_code for response in (bingos, history, shares, followers, following)
    } == {200}
    assert [item["id"] for item in bingos.data["results"]] == [str(created_public.public_id)]
    assert history.data["count"] == 1
    assert shares.data["count"] == 1
    assert followers.data["count"] == 1
    assert following.data["count"] == 1

    privacy = profile_user.privacy
    privacy.show_created_bingos = False
    privacy.show_play_history = False
    privacy.show_shared_results = False
    privacy.show_followers = False
    privacy.show_following = False
    privacy.save()

    for suffix in (
        "bingos/",
        "play-history/",
        "shared-results/",
        "followers/",
        "following/",
    ):
        hidden = guest.get(f"{base}/{suffix}")
        assert hidden.status_code == 200
        assert hidden.data["count"] == 0

    owner = _api_client(profile_user)
    owner_bingos = owner.get(f"{base}/bingos/")
    assert owner_bingos.data["count"] == 3
    draft_card = next(
        item for item in owner_bingos.data["results"] if item["id"] == str(draft_bingo.public_id)
    )
    assert draft_card["status"] == Bingo.Status.DRAFT
    assert draft_card["title"] == "Profile private draft"
    assert draft_card["description"] == "Only the creator can see this saved draft."
    assert draft_card["visibility"] == Bingo.Visibility.PRIVATE
    assert draft_card["tags"][0]["name"] == "work in progress"
    assert draft_card["preview"]["cells"][0]["text"] == "Profile private draft first cell"
