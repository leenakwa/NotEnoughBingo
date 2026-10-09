from __future__ import annotations

from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle

from apps.accounts.views import PasswordResetRequestView
from apps.bingos.models import Bingo
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.exports.models import ExportJob
from apps.plays.models import SharedResult

pytestmark = [pytest.mark.django_db, pytest.mark.integration]


def _assert_readable_rate_limit(response) -> None:
    assert response.status_code == 429
    seconds = int(response["Retry-After"])
    assert seconds >= 1
    assert response.data["error"]["code"] == "throttled"
    assert response.data["error"]["message"] == (
        f"Too many requests. Try again in {seconds} seconds."
    )
    assert response.data["error"]["details"] == {"retry_after_seconds": seconds}


def _api_client(user=None) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    if user is not None:
        client.force_login(user)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    client.credentials(
        HTTP_X_CSRFTOKEN=client.cookies[settings.CSRF_COOKIE_NAME].value,
    )
    return client


def _published_bingo(*, author, title: str):
    document = empty_draft_document(title=title, size=3, language="en")
    document["cells"][0]["text"] = title
    document["visibility"] = Bingo.Visibility.PUBLIC
    bingo = create_bingo(author=author, document=document)
    revision = publish_bingo(
        bingo=bingo,
        actor=author,
        idempotency_key=f"publish-{title.lower().replace(' ', '-')}",
    )
    bingo.refresh_from_db()
    return bingo, revision


def test_guest_share_scope_limits_new_work_without_breaking_idempotent_retry(
    monkeypatch,
    verified_user_factory,
) -> None:
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "shares", "2/min")
    author = verified_user_factory(username="share_limit_author")
    bingo, revision = _published_bingo(author=author, title="Share limit board")
    cell_id = str(revision.cells.get(position=0).public_id)
    client = _api_client()
    url = f"/api/v1/bingos/{bingo.public_id}/shares/"
    payload = {"selected_cells": [cell_id], "display_name": "Guest player"}

    first = client.post(
        url,
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="share-rate-limit-first",
    )
    retry = client.post(
        url,
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="share-rate-limit-first",
    )
    limited = client.post(
        url,
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="share-rate-limit-second",
    )

    assert first.status_code == retry.status_code == 201
    assert first.data["id"] == retry.data["id"]
    assert limited.status_code == 429
    assert SharedResult.objects.filter(bingo=bingo).count() == 1
    bingo.refresh_from_db()
    assert bingo.share_count == 1


def test_bingo_export_scope_limits_new_jobs_without_breaking_idempotent_retry(
    monkeypatch,
    verified_user_factory,
) -> None:
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "exports", "2/hour")
    author = verified_user_factory(username="export_limit_author")
    bingo, _ = _published_bingo(author=author, title="Export limit board")
    client = _api_client(author)
    url = f"/api/v1/bingos/{bingo.public_id}/exports/"

    first = client.post(
        url,
        {"format": "png"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="export-rate-limit-first",
    )
    retry = client.post(
        url,
        {"format": "png"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="export-rate-limit-first",
    )
    limited = client.post(
        url,
        {"format": "pdf"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="export-rate-limit-second",
    )

    assert first.status_code == retry.status_code == 202
    assert first.data["id"] == retry.data["id"]
    assert limited.status_code == 429
    assert ExportJob.objects.filter(owner=author, bingo=bingo).count() == 1


def test_password_reset_request_limit_does_not_block_link_confirmation(
    monkeypatch,
    verified_user_factory,
) -> None:
    request_scope = PasswordResetRequestView.throttle_scope
    single_request_rate = f"{1}/hour"
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, request_scope, single_request_rate)
    user = verified_user_factory(username="reset_limit_user")
    client = _api_client()

    with patch("apps.accounts.views.send_password_reset_email.delay"):
        first = client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")
        limited = client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")

    assert first.status_code == 202
    assert limited.status_code == 429
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    new_password = f"Unique-Reset-Example-{user.pk}-2026!"
    with patch("apps.accounts.services.send_password_security_notification.delay"):
        confirmed = client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": new_password},
            format="json",
        )
    assert confirmed.status_code == 204


@pytest.mark.parametrize(
    ("path", "scope", "authenticated"),
    [
        ("auth/login/", "auth_login", False),
        ("auth/register/", "auth_register", False),
        ("auth/resend-verification/", "auth_verify", False),
        ("auth/verify-email/", "auth_verify", False),
        ("auth/password-reset/", "password_reset_request", False),
        ("auth/password-reset/confirm/", "password_reset_confirm", False),
        ("auth/email-change/", "email_change_request", True),
        ("auth/email-change/confirm/", "email_change_confirm", False),
        ("uploads/intents/", "uploads", True),
    ],
)
def test_sensitive_scopes_limit_repeated_invalid_input(
    monkeypatch, verified_user_factory, path: str, scope: str, authenticated: bool
) -> None:
    client = _api_client(verified_user_factory() if authenticated else None)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, scope, "1/min")
    url = f"/api/v1/{path}"
    first = client.post(url, {}, format="json")
    assert first.status_code == 400
    _assert_readable_rate_limit(client.post(url, {}, format="json"))


@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize(
    ("first_path", "second_path"),
    [
        ("bingos/?search=literal", "bingos/?search=another"),
        ("feeds/discover/", "feeds/trending/"),
        ("authors/?search=author", "authors/?search=another"),
        ("tags/?search=tag", "tags/?search=another"),
    ],
)
def test_public_api_limits_cannot_be_reset_by_changing_query_or_endpoint(
    monkeypatch, verified_user_factory, authenticated: bool, first_path: str, second_path: str
) -> None:
    client = _api_client(verified_user_factory() if authenticated else None)
    # Author suggestions intentionally ignore sessions and use the per-IP
    # public quota for every caller. Other catalog routes can authenticate.
    user_quota = authenticated and not first_path.startswith("authors/")
    throttle = UserRateThrottle if user_quota else AnonRateThrottle
    scope = "user" if user_quota else "anon"
    monkeypatch.setitem(throttle.THROTTLE_RATES, scope, "1/min")
    # CSRF bootstrap uses the public quota too; start the request assertions
    # with a fresh test-only cache after that setup request.
    cache.clear()
    assert client.get(f"/api/v1/{first_path}").status_code == 200
    _assert_readable_rate_limit(client.get(f"/api/v1/{second_path}"))


def test_malformed_json_returns_safe_feedback_without_parser_diagnostics() -> None:
    response = _api_client().post(
        "/api/v1/auth/register/",
        '{"malformed-private-marker":',
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "parse_error"
    assert response.data["error"]["message"] == (
        "The request could not be read. Refresh the page and try again."
    )
    assert response.data["error"]["details"] == {}
    assert "malformed-private-marker" not in str(response.data)
    assert "JSON parse error" not in str(response.data)
