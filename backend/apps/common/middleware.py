from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_cache_control

SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
request_logger = logging.getLogger("app.request")


class PrivateApiCacheMiddleware:
    """Prevent storage of auth responses and authenticated API responses."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if not request.path.startswith("/api/v1/"):
            return self.get_response(request)
        authenticated = bool(getattr(request, "user", None) and request.user.is_authenticated)
        response = self.get_response(request)
        # Logout and rejected DRF authentication can clear request.user; DRF can
        # also restore a restricted pending-deletion session after Django auth.
        if (
            request.path.startswith("/api/v1/auth/")
            or authenticated
            or (getattr(request, "user", None) and request.user.is_authenticated)
        ):
            patch_cache_control(response, private=True, no_store=True)
        return response


class RequestIdMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        supplied = request.headers.get("X-Request-ID", "")
        request.request_id = supplied if SAFE_REQUEST_ID.fullmatch(supplied) else str(uuid.uuid4())  # type: ignore[attr-defined]
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id  # type: ignore[attr-defined]
        return response


class RequestLogMiddleware:
    """Emit one bounded structured completion event for every HTTP request."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        started_at = time.perf_counter()
        response = self.get_response(request)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        resolver_match = getattr(request, "resolver_match", None)
        request_logger.info(
            "http.request.complete",
            extra={
                "request_id": getattr(request, "request_id", ""),
                "method": request.method,
                # Route templates exclude user-provided path components and
                # unknown 404 paths, which can themselves contain secrets.
                "path": f"/{resolver_match.route}" if resolver_match else "/unmatched",
                "route": getattr(resolver_match, "view_name", "") or "",
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response


class SecurityHeadersMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if request.path.startswith(("/admin/", "/api/v1/docs/")):
            # Django Admin and the locally hosted API explorer require their
            # own static assets and a small amount of inline bootstrap code.
            content_security_policy = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "font-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            )
        else:
            content_security_policy = (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
            )
        response.setdefault("Content-Security-Policy", content_security_policy)
        response.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        )
        response.setdefault("Cross-Origin-Resource-Policy", "same-site")
        return response
