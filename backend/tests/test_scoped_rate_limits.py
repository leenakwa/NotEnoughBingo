from __future__ import annotations

from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.views import PasswordResetRequestView
from apps.bingos.models import Bingo
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.exports.models import ExportJob
from apps.plays.models import SharedResult

pytestmark = [pytest.mark.django_db, pytest.mark.integration]


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
    with patch("apps.accounts.views.send_critical_security_email.delay"):
        confirmed = client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": new_password},
            format="json",
        )
    assert confirmed.status_code == 204
