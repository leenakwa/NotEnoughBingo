from __future__ import annotations

from secrets import token_urlsafe

import pytest
from django.conf import settings
from django.contrib.auth.middleware import AuthenticationMiddleware
from django.http import HttpResponse
from django.test import Client, RequestFactory
from django.utils.module_loading import import_string


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
