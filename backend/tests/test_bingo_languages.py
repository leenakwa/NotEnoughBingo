from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo, save_draft
from apps.bingos.validators import empty_draft_document

pytestmark = pytest.mark.django_db


def _author() -> User:
    return User.objects.create_user(
        username="language_author",
        email="language_author@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )


def _board(author: User, title: str, language: str):
    document = empty_draft_document(title=title, size=3, language=language)
    document["visibility"] = "public"
    document["cells"][0]["text"] = title
    bingo = create_bingo(author=author, document=document)
    publish_bingo(bingo=bingo, actor=author, idempotency_key=f"publish-{title}")
    return bingo


def test_publish_requires_title_language_and_board_content() -> None:
    author = _author()
    bingo = create_bingo(author=author)
    with pytest.raises(ValidationError) as error:
        publish_bingo(bingo=bingo, actor=author, idempotency_key="empty-publish")
    assert "title" in error.value.message_dict

    draft = bingo.draft
    document = dict(draft.document)
    document["title"] = "A title"
    draft = save_draft(bingo=bingo, actor=author, document=document, expected_version=draft.version)
    with pytest.raises(ValidationError) as error:
        publish_bingo(bingo=bingo, actor=author, idempotency_key="no-language")
    assert "language" in error.value.message_dict

    document["language"] = "en"
    draft = save_draft(bingo=bingo, actor=author, document=document, expected_version=draft.version)
    with pytest.raises(ValidationError) as error:
        publish_bingo(bingo=bingo, actor=author, idempotency_key="no-cells")
    assert "cells" in error.value.message_dict

    document["cells"][0]["text"] = "First task"
    save_draft(bingo=bingo, actor=author, document=document, expected_version=draft.version)
    revision = publish_bingo(bingo=bingo, actor=author, idempotency_key="complete-publish")
    assert revision.language == "en"


def test_language_preferences_filter_discover_and_catalog() -> None:
    author = _author()
    english = _board(author, "English board", "en")
    russian = _board(author, "Russian board", "ru")
    client = APIClient()
    client.force_login(author)

    saved = client.patch("/api/v1/profiles/me/", {"preferred_languages": ["ru"]}, format="json")
    assert saved.status_code == 200
    assert saved.data["language_preferences_confirmed"] is True
    assert saved.data["preferred_languages"] == ["ru"]
    public_profile = client.get(f"/api/v1/profiles/{author.username}/")
    assert "preferred_languages" not in public_profile.data
    assert "language_preferences_confirmed" not in public_profile.data
    assert (
        client.patch(
            "/api/v1/profiles/me/", {"preferred_languages": ["invalid"]}, format="json"
        ).status_code
        == 400
    )

    recommended = client.get("/api/v1/feeds/discover/")
    assert [item["id"] for item in recommended.data["results"]] == [str(russian.public_id)]
    both = client.get("/api/v1/feeds/discover/?languages=en&languages=ru")
    assert {item["id"] for item in both.data["results"]} == {
        str(english.public_id),
        str(russian.public_id),
    }
    catalog = client.get("/api/v1/bingos/?languages=en")
    assert [item["id"] for item in catalog.data["results"]] == [str(english.public_id)]
    assert client.get("/api/v1/bingos/?languages=invalid").status_code == 400


def test_drafts_are_separate_from_created_bingos() -> None:
    author = _author()
    published = _board(author, "Published board", "en")
    draft = create_bingo(author=author)
    client = APIClient()
    client.force_login(author)
    base = f"/api/v1/profiles/{author.username}/bingos/"

    created = client.get(f"{base}?status=created")
    drafts = client.get(f"{base}?status=draft")
    assert [item["id"] for item in created.data["results"]] == [str(published.public_id)]
    assert [item["id"] for item in drafts.data["results"]] == [str(draft.public_id)]
    assert drafts.data["results"][0]["language"] == ""

    client.logout()
    assert client.get(f"{base}?status=draft").data["count"] == 0
