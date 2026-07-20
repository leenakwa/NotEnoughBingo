from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from apps.accounts.models import SessionMetadata


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
