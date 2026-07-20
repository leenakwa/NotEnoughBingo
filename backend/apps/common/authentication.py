from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from rest_framework.authentication import CSRFCheck, SessionAuthentication
from rest_framework.exceptions import PermissionDenied

ACCOUNT_DELETION_WRITE_ALLOWLIST = {
    "/api/v1/auth/account-deletion/",
    "/api/v1/auth/account-export/",
    "/api/v1/auth/logout/",
}


class StrictSessionAuthentication(SessionAuthentication):
    """Django sessions with CSRF enforcement for authenticated and anonymous unsafe calls."""

    def authenticate(self, request):  # type: ignore[no-untyped-def]
        self.enforce_csrf(request)
        user = getattr(request._request, "user", None)
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
