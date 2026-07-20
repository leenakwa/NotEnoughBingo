from __future__ import annotations

from collections.abc import Callable
from itertools import count
from typing import Any

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware
from django.core.cache import cache
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User
from apps.bingos.models import Bingo
from apps.social.models import Comment

UserFactory = Callable[..., User]
BingoFactory = Callable[..., Bingo]
CommentFactory = Callable[..., Comment]


@pytest.fixture(autouse=True)
def clear_default_cache() -> None:
    """Keep throttling, login-rate and deduplication state isolated per test."""

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user_factory(db) -> UserFactory:
    sequence = count(1)

    def create_user(**overrides: Any) -> User:
        number = next(sequence)
        password = overrides.pop("password", "Correct-Horse-Battery-42")
        username = overrides.pop("username", f"user_{number}")
        email = overrides.pop("email", f"user-{number}@example.test")
        return User.objects.create_user(
            username=username,
            email=email,
            password=password,
            **overrides,
        )

    return create_user


@pytest.fixture
def verified_user_factory(user_factory: UserFactory) -> UserFactory:
    def create_verified_user(**overrides: Any) -> User:
        overrides.setdefault("email_verified_at", timezone.now())
        return user_factory(**overrides)

    return create_verified_user


@pytest.fixture
def bingo_factory(db, verified_user_factory: UserFactory) -> BingoFactory:
    sequence = count(1)

    def create_bingo(**overrides: Any) -> Bingo:
        number = next(sequence)
        defaults: dict[str, Any] = {
            "author": verified_user_factory(),
            "title": f"Board {number}",
            "description": "A test board",
            "size": 3,
            "status": Bingo.Status.PUBLISHED,
            "visibility": Bingo.Visibility.PUBLIC,
            "published_at": timezone.now(),
        }
        defaults.update(overrides)
        return Bingo.objects.create(**defaults)

    return create_bingo


@pytest.fixture
def comment_factory(
    db, bingo_factory: BingoFactory, verified_user_factory: UserFactory
) -> CommentFactory:
    sequence = count(1)

    def create_comment(**overrides: Any) -> Comment:
        number = next(sequence)
        defaults: dict[str, Any] = {
            "bingo": bingo_factory(),
            "author": verified_user_factory(),
            "body": f"Comment {number}",
        }
        defaults.update(overrides)
        return Comment.objects.create(**defaults)

    return create_comment


@pytest.fixture
def api_request_factory() -> APIRequestFactory:
    return APIRequestFactory(enforce_csrf_checks=True)


@pytest.fixture
def csrf_request(api_request_factory: APIRequestFactory):
    """Build a DRF request whose cookie/header CSRF pair is valid."""

    def build(
        method: str,
        path: str,
        data: Any | None = None,
        *,
        user: User | None = None,
        with_session: bool = False,
    ):
        request = getattr(api_request_factory, method.lower())(path, data=data, format="json")
        if with_session:
            SessionMiddleware(lambda req: None).process_request(request)
            request.session.save()
        request.user = user if user is not None else AnonymousUser()
        token = get_token(request)
        request.COOKIES["neb_csrf"] = request.META["CSRF_COOKIE"]
        request.META["HTTP_X_CSRFTOKEN"] = token
        return request

    return build
