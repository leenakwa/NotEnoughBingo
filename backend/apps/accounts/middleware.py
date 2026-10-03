from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from apps.accounts.models import SessionMetadata
from apps.accounts.session_events import record_logout_event


class RotationSafeSessionMiddleware(SessionMiddleware):
    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        response = super().process_response(request, response)
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
