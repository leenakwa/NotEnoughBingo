from __future__ import annotations

from datetime import timedelta
from secrets import token_urlsafe

import pytest
from django.conf import settings
from django.contrib.auth.middleware import AuthenticationMiddleware
from django.contrib.sessions.backends.cached_db import SessionStore
from django.contrib.sessions.models import Session
from django.http import HttpResponse
from django.test import Client, RequestFactory
from django.utils import timezone
from django.utils.http import http_date
from django.utils.module_loading import import_string
from freezegun import freeze_time


@pytest.mark.django_db
def test_login_cookie_and_cached_session_expire_without_renewal_on_reads(
    verified_user_factory, settings
) -> None:
    settings.SESSION_COOKIE_AGE = 60
    settings.SESSION_SAVE_EVERY_REQUEST = False
    password = token_urlsafe(24)
    user = verified_user_factory(password=password)
    browser = Client()
    with freeze_time("2026-10-08 12:00:00") as clock:
        started = timezone.now()
        response = browser.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": password},
            content_type="application/json",
        )
        assert response.status_code == 200
        cookie = response.cookies[settings.SESSION_COOKIE_NAME]
        expiry = started + timedelta(seconds=60)
        assert cookie["max-age"] == 60
        assert cookie["expires"] == http_date(expiry.timestamp())
        key = cookie.value
        assert Session.objects.get(session_key=key).expire_date == expiry
        store = SessionStore(key)
        # Login populated the configured cached-db store. Observe its timeout
        # under the same frozen clock; never purge it to simulate expiration.
        assert store._cache.get(store.cache_key) is not None

        for elapsed in (30, 29):
            clock.tick(timedelta(seconds=elapsed))
            authenticated = browser.get("/api/v1/auth/me/")
            assert authenticated.status_code == 200
            assert settings.SESSION_COOKIE_NAME not in authenticated.cookies
            assert Session.objects.get(session_key=key).expire_date == expiry
            assert store._cache.get(store.cache_key) is not None

        clock.tick(timedelta(seconds=2))
        assert store._cache.get(store.cache_key) is None
        assert Session.objects.get(session_key=key).expire_date == expiry
        assert store.load() == {}
        # Django's Client retains expired cookies. This deliberately proves
        # server rejection even when a client continues sending the old key.
        expired = browser.get("/api/v1/auth/me/")
        assert expired.wsgi_request.COOKIES[settings.SESSION_COOKIE_NAME] == key
        assert expired.status_code == 401
        assert browser.get("/api/v1/auth/session/").json()["user"] is None


@pytest.mark.django_db
def test_csrf_cookie_expiry_headers_do_not_impose_a_server_token_ttl(
    verified_user_factory, settings
) -> None:
    settings.CSRF_COOKIE_AGE = 30
    settings.SESSION_COOKIE_AGE = 60
    browser = Client(enforce_csrf_checks=True)
    user = verified_user_factory()
    with freeze_time("2026-10-08 12:00:00") as clock:
        browser.force_login(user)
        response = browser.get("/api/v1/auth/csrf/")
        assert response.status_code == 200
        cookie = response.cookies[settings.CSRF_COOKIE_NAME]
        assert cookie["max-age"] == 30
        assert cookie["expires"] == http_date((timezone.now() + timedelta(seconds=30)).timestamp())
        token = response.json()["csrf"]
        clock.tick(timedelta(seconds=31))
        assert browser.post("/api/v1/auth/logout/").status_code == 403
        # The client still sends the saved cookie. CSRF validates the matching
        # token, rather than enforcing the browser's cookie expiration as a TTL.
        accepted = browser.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=token)
        assert accepted.wsgi_request.COOKIES[settings.CSRF_COOKIE_NAME] == cookie.value
        assert accepted.status_code == 204


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("preload_session", [False, True])
def test_old_request_cannot_clear_the_cookie_rotated_by_password_change(
    verified_user_factory, preload_session
) -> None:
    initial_password = token_urlsafe(24)
    next_password = token_urlsafe(24)
    user = verified_user_factory(password=initial_password)
    browser = Client()
    login = browser.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": initial_password},
        content_type="application/json",
    )
    assert login.status_code == 200
    old_request = RequestFactory().get(
        "/api/v1/auth/session/",
        HTTP_COOKIE=f"{settings.SESSION_COOKIE_NAME}={browser.cookies[settings.SESSION_COOKIE_NAME].value}",
    )
    middleware_class = import_string(
        next(path for path in settings.MIDDLEWARE if path.endswith("SessionMiddleware"))
    )
    middleware = middleware_class(lambda request: HttpResponse())
    middleware.process_request(old_request)
    AuthenticationMiddleware(lambda request: HttpResponse()).process_request(old_request)
    if preload_session:
        # Authentication remains lazy; emulate a request that loaded the old
        # payload before rotation but checks its password hash afterwards.
        dict(old_request.session)
    changed = browser.post(
        "/api/v1/auth/password-change/",
        {
            "current_password": initial_password,
            "new_password": next_password,
        },
        content_type="application/json",
    )
    assert changed.status_code == 204
    assert not old_request.user.is_authenticated
    late_response = middleware.process_response(old_request, HttpResponse())
    assert settings.SESSION_COOKIE_NAME not in late_response.cookies
    browser.cookies.update(late_response.cookies)
    assert browser.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db
def test_explicit_logout_still_deletes_the_cookie_and_invalidates_authentication(
    verified_user_factory,
) -> None:
    user = verified_user_factory()
    browser = Client()
    browser.force_login(user)
    response = browser.post("/api/v1/auth/logout/")
    assert response.status_code == 204
    assert response.cookies[settings.SESSION_COOKIE_NAME]["max-age"] == 0
    assert browser.get("/api/v1/auth/me/").status_code == 401
