from __future__ import annotations

from uuid import uuid4

from django.conf import settings
from django.http import HttpRequest, HttpResponse

LOGOUT_EVENT_COOKIE = "neb_logout_event"
LOGOUT_EVENT_SALT = "accounts.explicit-logout-event"
LOGOUT_EVENT_MAX_AGE = 7 * 24 * 60 * 60


def read_logout_event(request: HttpRequest) -> str | None:
    value = request.get_signed_cookie(
        LOGOUT_EVENT_COOKIE,
        default=None,
        salt=LOGOUT_EVENT_SALT,
        max_age=LOGOUT_EVENT_MAX_AGE,
    )
    return value if isinstance(value, str) else None


def record_logout_event(response: HttpResponse) -> None:
    # A browser-wide notification, not an authentication credential. Retaining
    # it through login lets tabs that missed sign-out clear their private drafts.
    response.set_signed_cookie(
        LOGOUT_EVENT_COOKIE,
        uuid4().hex,
        salt=LOGOUT_EVENT_SALT,
        max_age=LOGOUT_EVENT_MAX_AGE,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        domain=settings.SESSION_COOKIE_DOMAIN,
        path=settings.SESSION_COOKIE_PATH,
    )
