from __future__ import annotations

from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY, get_user_model
from django.http import HttpRequest, HttpResponse
from django.utils.crypto import constant_time_compare
from rest_framework.authentication import CSRFCheck, SessionAuthentication
from rest_framework.exceptions import PermissionDenied

ACCOUNT_DELETION_WRITE_ALLOWLIST = {
    "/api/v1/auth/account-deletion/",
    "/api/v1/auth/account-export/",
    "/api/v1/auth/logout/",
}


class StrictSessionAuthentication(SessionAuthentication):
    """Django sessions with CSRF enforcement for authenticated and anonymous unsafe calls."""

    def authenticate_header(self, request) -> str:  # type: ignore[no-untyped-def]
        return 'Session realm="api"'

    def authenticate(self, request):  # type: ignore[no-untyped-def]
        self.enforce_csrf(request)
        user = getattr(request._request, "user", None)
        if not user or not user.is_authenticated:
            user = self._pending_deletion_session_user(request)
        if (
            not user
            or not user.is_active
            or getattr(user, "suspended_at", None)
            or getattr(user, "deleted_at", None)
        ):
            return None
        if (
            getattr(user, "deletion_requested_at", None)
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.path not in ACCOUNT_DELETION_WRITE_ALLOWLIST
        ):
            raise PermissionDenied("Account deletion is pending. Cancel it before making changes.")
        return user, None

    @staticmethod
    def _pending_deletion_session_user(request):  # type: ignore[no-untyped-def]
        """Restore only the restricted API session created by an explicit pending-user login."""
        session = getattr(request._request, "session", None)
        if session is None:
            return None
        user_id = session.get(SESSION_KEY)
        if (
            not user_id
            or session.get(BACKEND_SESSION_KEY) != "apps.accounts.backends.ActiveAccountBackend"
        ):
            return None
        user_model = get_user_model()
        user = user_model._default_manager.filter(
            pk=user_id,
            is_active=True,
            email_verified_at__isnull=False,
            suspended_at__isnull=True,
            deletion_requested_at__isnull=False,
            deleted_at__isnull=True,
        ).first()
        session_hash = session.get(HASH_SESSION_KEY)
        if not user or not session_hash:
            return None
        if not constant_time_compare(session_hash, user.get_session_auth_hash()):
            return None
        return user

    def enforce_csrf(self, request) -> None:  # type: ignore[no-untyped-def]
        def get_response(_request: HttpRequest) -> HttpResponse:
            return HttpResponse()

        def view_callback(_request: HttpRequest, *args, **kwargs) -> HttpResponse:
            return HttpResponse()

        check = CSRFCheck(get_response)
        check.process_request(request)
        reason = check.process_view(request, view_callback, (), {})
        if reason:
            raise PermissionDenied(f"CSRF Failed: {reason}")
