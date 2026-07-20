from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache


def hash_sensitive(value: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(),
        value.strip().lower().encode(),
        hashlib.sha256,
    ).hexdigest()


def request_ip(request) -> str:  # type: ignore[no-untyped-def]
    remote_address = request.META.get("REMOTE_ADDR", "").strip()
    trusted_hops = max(int(settings.TRUSTED_PROXY_HOPS), 0)
    if trusted_hops == 0:
        return remote_address
    forwarded = [
        address.strip()
        for address in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")
        if address.strip()
    ]
    if len(forwarded) < trusted_hops:
        return remote_address
    # Select from the right-hand side of the chain so a client cannot become
    # the throttling identity by prepending a forged X-Forwarded-For value.
    return forwarded[-trusted_hops]


@dataclass(frozen=True)
class LoginRateState:
    allowed: bool
    retry_after: int


class LoginRateLimiter:
    window_seconds = 15 * 60
    max_email_attempts = 8
    max_ip_attempts = 40

    @classmethod
    def check(cls, *, email: str, ip: str) -> LoginRateState:
        email_count = int(cache.get(f"auth:email:{hash_sensitive(email)}", 0))
        ip_count = int(cache.get(f"auth:ip:{hash_sensitive(ip)}", 0))
        allowed = email_count < cls.max_email_attempts and ip_count < cls.max_ip_attempts
        return LoginRateState(allowed=allowed, retry_after=cls.window_seconds if not allowed else 0)

    @classmethod
    def failure(cls, *, email: str, ip: str) -> None:
        for key in (f"auth:email:{hash_sensitive(email)}", f"auth:ip:{hash_sensitive(ip)}"):
            if cache.add(key, 1, timeout=cls.window_seconds):
                continue
            try:
                cache.incr(key)
            except ValueError:
                cache.set(key, 1, timeout=cls.window_seconds)

    @classmethod
    def success(cls, *, email: str) -> None:
        cache.delete(f"auth:email:{hash_sensitive(email)}")
