from __future__ import annotations

import pytest
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle

pytestmark = pytest.mark.django_db


def _ssr_guest(ip: str | None) -> APIClient:
    # Every direct Next.js request comes from the same private frontend replica.
    client = APIClient(REMOTE_ADDR="10.0.0.20")
    if ip is not None:
        client.credentials(HTTP_X_FORWARDED_FOR=ip)
    return client


def _single_proxy_settings() -> dict:
    return {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}


@pytest.mark.parametrize("second_ip", ["203.0.113.26", "2001:db8::26"])
def test_ssr_guests_have_independent_session_and_anonymous_quotas(monkeypatch, second_ip) -> None:
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "session_status", "1/min")
    monkeypatch.setitem(AnonRateThrottle.THROTTLE_RATES, "anon", "1/min")
    monkeypatch.setitem(UserRateThrottle.THROTTLE_RATES, "user", "10/min")
    with override_settings(REST_FRAMEWORK=_single_proxy_settings()):
        first = _ssr_guest("203.0.113.25")
        second = _ssr_guest(second_ip)

        assert first.get("/api/v1/auth/session/").status_code == 200
        assert first.get("/api/v1/auth/session/").status_code == 429
        assert second.get("/api/v1/auth/session/").status_code == 200

        # Session scope does not consume either visitor's anonymous quota.
        assert first.get("/api/v1/sitemap/bingos/index/").status_code == 200
        assert first.get("/api/v1/sitemap/bingos/", {"part": "0"}).status_code == 429
        assert second.get("/api/v1/sitemap/bingos/", {"part": "0"}).status_code == 200
        assert second.get("/api/v1/sitemap/bingos/index/").status_code == 429


def test_ssr_public_scope_is_shared_with_same_visitors_browser_request(monkeypatch) -> None:
    monkeypatch.setitem(AnonRateThrottle.THROTTLE_RATES, "anon", "1/min")
    with override_settings(REST_FRAMEWORK=_single_proxy_settings()):
        ssr = _ssr_guest("203.0.113.25")
        browser = APIClient(REMOTE_ADDR="10.0.0.10")
        browser.credentials(HTTP_X_FORWARDED_FOR="203.0.113.25")

        assert ssr.get("/api/v1/sitemap/bingos/index/").status_code == 200
        assert browser.get("/api/v1/bingos/").status_code == 429
        other = _ssr_guest("203.0.113.26")
        assert other.get("/api/v1/bingos/").status_code == 200


def test_unforwarded_ssr_requests_share_replica_quota_and_do_not_consume_forwarded_quota(
    monkeypatch,
) -> None:
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "session_status", "1/min")
    with override_settings(REST_FRAMEWORK=_single_proxy_settings()):
        assert _ssr_guest(None).get("/api/v1/auth/session/").status_code == 200
        assert _ssr_guest(None).get("/api/v1/auth/session/").status_code == 429
        assert _ssr_guest("203.0.113.25").get("/api/v1/auth/session/").status_code == 200
