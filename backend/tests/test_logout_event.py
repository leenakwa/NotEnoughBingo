from __future__ import annotations

from secrets import token_urlsafe
from time import time
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.test import Client


@pytest.mark.django_db
@pytest.mark.parametrize("secure", [False, True])
def test_explicit_logout_event_survives_same_account_login(
    verified_user_factory, settings, secure
) -> None:
    settings.SESSION_COOKIE_SECURE = secure
    password = token_urlsafe(24)
    user = verified_user_factory(password=password)
    browser = Client()
    browser.force_login(user)
    before = browser.get("/api/v1/auth/session/")
    assert before.data["logout_event"] is None
    logged_out = browser.post("/api/v1/auth/logout/")
    assert logged_out.status_code == 204
    cookie = logged_out.cookies["neb_logout_event"]
    assert cookie["httponly"]
    assert bool(cookie["secure"]) == settings.SESSION_COOKIE_SECURE
    assert cookie["samesite"] == settings.SESSION_COOKIE_SAMESITE
    assert cookie["max-age"] == 7 * 24 * 60 * 60
    guest = browser.get("/api/v1/auth/session/")
    event = guest.data["logout_event"]
    assert isinstance(event, str)
    assert len(event) == 32
    assert guest.data["user"] is None
    assert browser.get("/api/v1/auth/me/").status_code == 401
    assert guest["Cache-Control"] == "private, no-store"
    logged_in = browser.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        content_type="application/json",
    )
    assert logged_in.status_code == 200
    current = browser.get("/api/v1/auth/session/")
    assert current.data["logout_event"] == event
    assert current.data["user"]["id"] == str(user.public_id)
    logged_out_again = browser.post("/api/v1/auth/logout/")
    assert logged_out_again.status_code == 204
    assert browser.get("/api/v1/auth/session/").data["logout_event"] != event


@pytest.mark.django_db
def test_invalid_logout_event_cookie_cannot_report_a_signed_logout(client) -> None:
    client.cookies["neb_logout_event"] = "forged-event"
    response = client.get("/api/v1/auth/session/")
    assert response.status_code == 200
    assert response.data["logout_event"] is None
    assert response.data["user"] is None


@pytest.mark.django_db
def test_expired_session_does_not_create_a_logout_event(verified_user_factory) -> None:
    user = verified_user_factory()
    browser = Client()
    browser.force_login(user)
    browser.session.flush()
    response = browser.get("/api/v1/auth/session/")
    assert response.status_code == 200
    assert response.data["user"] is None
    assert response.data["logout_event"] is None
    assert "neb_logout_event" not in response.cookies


@pytest.mark.django_db
def test_expired_signed_logout_event_is_ignored(client) -> None:
    from django.core.signing import get_cookie_signer

    from apps.accounts.session_events import LOGOUT_EVENT_COOKIE, LOGOUT_EVENT_SALT

    with patch("django.core.signing.time.time", return_value=time() - 8 * 24 * 60 * 60):
        value = get_cookie_signer(salt=LOGOUT_EVENT_COOKIE + LOGOUT_EVENT_SALT).sign(uuid4().hex)
    client.cookies[LOGOUT_EVENT_COOKIE] = value
    response = client.get("/api/v1/auth/session/")
    assert response.status_code == 200
    assert response.data["logout_event"] is None
    assert response.data["user"] is None
