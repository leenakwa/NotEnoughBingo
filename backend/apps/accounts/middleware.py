from __future__ import annotations

import time
from collections.abc import Callable
from datetime import timedelta
from typing import Literal

from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from django.utils.http import http_date

from apps.accounts.models import SessionMetadata
from apps.accounts.session_events import record_logout_event


class RotationSafeSessionMiddleware(SessionMiddleware):
    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        response = super().process_response(request, response)
        if getattr(request, "_neb_password_session_rotated", False) and response.status_code < 500:
            # The DB-only replacement was already saved with the password and
            # audit record. Sending its cookie needs no cache or second DB write.
            session = request.session
            session_key = session.session_key
            if session_key is None:
                raise ValueError("A committed password session must have a durable session key.")
            same_site_values: dict[str, Literal["Lax", "Strict", "None"]] = {
                "lax": "Lax",
                "strict": "Strict",
                "none": "None",
            }
            configured_same_site = settings.SESSION_COOKIE_SAMESITE
            same_site = None
            if configured_same_site:
                try:
                    same_site = same_site_values[configured_same_site.lower()]
                except KeyError as exc:
                    raise ValueError("samesite must be 'lax', 'none', or 'strict'.") from exc
            max_age = None if session.get_expire_at_browser_close() else session.get_expiry_age()
            expires = None if max_age is None else http_date(time.time() + max_age)
            response.set_cookie(
                settings.SESSION_COOKIE_NAME,
                session_key,
                max_age=max_age,
                expires=expires,
                domain=settings.SESSION_COOKIE_DOMAIN,
                path=settings.SESSION_COOKIE_PATH,
                secure=bool(settings.SESSION_COOKIE_SECURE),
                httponly=bool(settings.SESSION_COOKIE_HTTPONLY),
                samesite=same_site,
            )
            patch_vary_headers(response, ("Cookie",))
        cookie = response.cookies.get(settings.SESSION_COOKIE_NAME)
        if (
            cookie is not None
            and not cookie.value
            and cookie["max-age"] == 0
            and not getattr(request, "_neb_explicit_logout", False)
        ):
            # An old request may finish after login/password-change rotated the
            # browser cookie. Server-side invalidation already rejects its old
            # key; an implicit deletion here would erase the newer valid cookie.
            del response.cookies[settings.SESSION_COOKIE_NAME]
        if getattr(request, "_neb_explicit_logout", False):
            record_logout_event(response)
        return response


class SessionMetadataMiddleware:
    update_interval = timedelta(minutes=5)

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if getattr(request, "_neb_credentials_committed", False):
            # Credentials already persisted or revoked this session. A redundant
            # write here must not turn their committed success into a 500.
            return response
        if not getattr(request, "user", None) or not request.user.is_authenticated:
            return response
        session_key = request.session.session_key
        if not session_key:
            return response
        cutoff = timezone.now() - self.update_interval
        SessionMetadata.objects.filter(
            session_key=session_key,
            user=request.user,
            revoked_at__isnull=True,
            last_seen_at__lt=cutoff,
        ).update(last_seen_at=timezone.now())
        return response
