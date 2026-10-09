from __future__ import annotations

from secrets import token_urlsafe

import pytest
from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.utils import timezone

from apps.accounts.services import issue_email_verification

pytestmark = pytest.mark.django_db


def _cacheable_response(request, status: int = 200) -> HttpResponse:
    response = HttpResponse(status=status)
    response["Cache-Control"] = "public, max-age=600"
    response["ETag"] = '"public-revision"'
    response["Vary"] = "Accept-Language"
    return response


urlpatterns = [
    path("api/v1/cache-example/", _cacheable_response),
    path("api/v1/cache-example-not-modified/", _cacheable_response, {"status": 304}),
    path("static/cache-example.css", _cacheable_response),
]


def test_anonymous_csrf_response_is_not_cacheable() -> None:
    client = Client(enforce_csrf_checks=True)

    response = client.get("/api/v1/auth/csrf/")

    assert response.status_code == 200
    assert response.json()["csrf"]
    assert "neb_csrf" in response.cookies
    assert response["Cache-Control"] == "private, no-store"
    assert "Cookie" in response["Vary"]


def test_anonymous_email_verification_success_and_reused_token_are_not_cacheable(
    user_factory,
) -> None:
    user = user_factory()
    token = issue_email_verification(user)
    assert token is not None
    client = Client(enforce_csrf_checks=True)
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf"]

    response = client.post(
        "/api/v1/auth/verify-email/",
        {"token": token},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf,
    )

    assert response.status_code == 200
    assert response.json()["email"] == user.email
    assert response["Cache-Control"] == "private, no-store"
    assert client.get("/api/v1/auth/session/").json()["user"] is None

    reused_token_response = client.post(
        "/api/v1/auth/verify-email/",
        {"token": token},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf,
    )

    assert reused_token_response.status_code == 400
    assert "token" in reused_token_response.json()["error"]["details"]
    assert reused_token_response["Cache-Control"] == "private, no-store"


def test_anonymous_password_recovery_response_is_not_cacheable() -> None:
    client = Client(enforce_csrf_checks=True)
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf"]

    response = client.post(
        "/api/v1/auth/password-reset/",
        {"email": "unknown@example.test"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf,
    )

    assert response.status_code == 202
    assert response["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/auth/me/",
        "/api/v1/auth/sessions/",
        "/api/v1/profiles/me/",
        "/api/v1/auth/session/",
    ],
)
def test_authenticated_personal_data_cannot_be_stored_by_http_caches(
    path: str, verified_user_factory
) -> None:
    client = Client()
    client.force_login(verified_user_factory())

    response = client.get(path)

    assert response.status_code == 200
    directives = {part.strip().lower() for part in response.get("Cache-Control", "").split(",")}
    assert {"private", "no-store"} <= directives
    assert "public" not in directives
    assert "Cookie" in response["Vary"]
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Content-Security-Policy"].startswith("default-src 'none'")


def test_pending_deletion_session_restored_by_drf_is_not_cacheable(
    verified_user_factory,
) -> None:
    client = Client()
    client.force_login(verified_user_factory(deletion_requested_at=timezone.now()))

    response = client.get("/api/v1/auth/me/")

    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"


def test_successful_login_response_is_private_when_request_started_anonymous(
    verified_user_factory,
) -> None:
    password = token_urlsafe(24)
    user = verified_user_factory(password=password)
    client = Client()
    assert client.get("/api/v1/auth/session/").json()["user"] is None

    response = client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == user.email
    assert response["Cache-Control"] == "private, no-store"
    assert client.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.parametrize("status", [200, 304])
def test_authenticated_public_response_is_private_without_losing_validators(
    status: int, settings, verified_user_factory
) -> None:
    settings.ROOT_URLCONF = __name__
    client = Client()
    client.force_login(verified_user_factory())
    url = "/api/v1/cache-example/" if status == 200 else "/api/v1/cache-example-not-modified/"

    response = client.get(url)

    assert response.status_code == status
    assert response["Cache-Control"] == "max-age=600, private, no-store"
    assert response["ETag"] == '"public-revision"'
    assert {"Accept-Language", "Cookie"} <= set(response["Vary"].split(", "))


def test_anonymous_public_response_retains_its_cache_policy(settings) -> None:
    settings.ROOT_URLCONF = __name__

    response = Client().get("/api/v1/cache-example/")

    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=600"
    assert response["ETag"] == '"public-revision"'
    assert "Accept-Language" in response["Vary"]


def test_authenticated_static_response_retains_its_cache_policy(
    settings, verified_user_factory
) -> None:
    settings.ROOT_URLCONF = __name__
    client = Client()
    client.force_login(verified_user_factory())

    response = client.get("/static/cache-example.css")

    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=600"
    assert response["ETag"] == '"public-revision"'


def test_authenticated_missing_resource_response_is_not_cacheable(verified_user_factory) -> None:
    client = Client()
    client.force_login(verified_user_factory())

    response = client.get("/api/v1/profiles/no-such-user/")

    assert response.status_code == 404
    assert response["Cache-Control"] == "private, no-store"


def test_authenticated_csrf_error_response_is_not_cacheable(verified_user_factory) -> None:
    client = Client(enforce_csrf_checks=True)
    client.force_login(verified_user_factory())

    response = client.post("/api/v1/auth/password-change/", {}, content_type="application/json")

    assert response.status_code == 403
    assert response["Cache-Control"] == "private, no-store"


def test_logout_response_remains_uncacheable_after_clearing_request_user(
    verified_user_factory,
) -> None:
    client = Client()
    client.force_login(verified_user_factory())

    response = client.post("/api/v1/auth/logout/")

    assert response.status_code == 204
    assert response["Cache-Control"] == "private, no-store"
