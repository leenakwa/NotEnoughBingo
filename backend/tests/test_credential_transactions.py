from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from secrets import token_urlsafe
from threading import Barrier
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import HASH_SESSION_KEY
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.backends.cached_db import SessionStore as CachedDbSessionStore
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.exceptions import ValidationError
from django.db import DatabaseError, close_old_connections, connection
from django.db.models.query import QuerySet
from django.test import Client, RequestFactory
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import http_date, urlsafe_base64_encode
from freezegun import freeze_time

from apps.accounts import services, tasks
from apps.accounts.models import SecurityEvent, SessionMetadata, User
from apps.accounts.views import PasswordChangeView, PasswordResetConfirmView

pytestmark = pytest.mark.django_db(transaction=True)

OLD_PASSWORD = token_urlsafe(24)
NEW_PASSWORD = token_urlsafe(24)


def authenticated_request(user, csrf_request):
    request = csrf_request(
        "post",
        "/api/v1/auth/password-change/",
        {"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD},
        user=user,
        with_session=True,
    )
    metadata = services.create_authenticated_session(request, user)
    return request, metadata


@pytest.mark.parametrize(
    ("operation", "failure"),
    [
        ("reset", "audit"),
        ("reset", "session_delete"),
        ("change", "audit"),
        ("change", "session_delete"),
        ("change", "replacement_session"),
    ],
)
def test_credential_sql_failure_rolls_back_password_sessions_and_callbacks(
    operation, failure, verified_user_factory, csrf_request, monkeypatch
) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    request, metadata = authenticated_request(user, csrf_request)
    original_session = request.session
    original_key = original_session.session_key
    original_sessions = set(Session.objects.values_list("session_key", flat=True))
    warmed_payload = CachedDbSessionStore(original_key).load()
    token = default_token_generator.make_token(user)
    original_invalidate = services.invalidate_credential_session_keys

    def fail_after_session_delete(keys):
        original_invalidate(keys)
        raise DatabaseError("Synthetic durable-session deletion failure")

    def fail_sql(*args, **kwargs):
        raise DatabaseError("Synthetic credential SQL failure")

    def mutate_credentials():
        if operation == "reset":
            services.reset_password(user_id=str(user.pk), token=token, new_password=NEW_PASSWORD)
        else:
            services.change_password(
                request, current_password=OLD_PASSWORD, new_password=NEW_PASSWORD
            )

    if failure == "audit":
        monkeypatch.setattr(SecurityEvent.objects, "create", fail_sql)
    elif failure == "session_delete":
        monkeypatch.setattr(
            services, "invalidate_credential_session_keys", fail_after_session_delete
        )
    else:
        monkeypatch.setattr(SessionStore, "save", fail_sql)
    session_cache = CachedDbSessionStore(original_key)._cache
    with (
        patch.object(session_cache, "delete") as purge,
        patch("apps.accounts.services.send_password_security_notification.delay") as dispatch,
        pytest.raises(DatabaseError),
    ):
        mutate_credentials()
    user.refresh_from_db()
    metadata.refresh_from_db()
    assert user.check_password(OLD_PASSWORD)
    assert metadata.session_key == original_key
    assert metadata.revoked_at is None
    assert request.session is original_session
    assert request.session[HASH_SESSION_KEY] == user.get_session_auth_hash()
    assert not getattr(request, "_neb_password_session_rotated", False)
    assert set(Session.objects.values_list("session_key", flat=True)) == original_sessions
    assert CachedDbSessionStore(original_key).load() == warmed_payload
    assert default_token_generator.check_token(user, token)
    assert not SecurityEvent.objects.filter(
        event_type__in=tasks.PASSWORD_SECURITY_MESSAGES
    ).exists()
    purge.assert_not_called()
    dispatch.assert_not_called()


def test_password_change_keeps_session_data_expiry_and_rotates_cookie_on_django_request(
    verified_user_factory, csrf_request
) -> None:
    with freeze_time("2026-10-08 12:00:00") as clock:
        user = verified_user_factory(password=OLD_PASSWORD)
        request, metadata = authenticated_request(user, csrf_request)
        expiry = timezone.now() + timedelta(minutes=20)
        request.session["cart"] = {"board": "saved"}
        request.session.set_expiry(expiry)
        request.session.save()
        old_key = request.session.session_key
        clock.tick(timedelta(minutes=5))
        with patch("apps.accounts.services.send_password_security_notification.delay"):
            response = PasswordChangeView.as_view()(request)
        assert response.status_code == 204
        metadata.refresh_from_db()
        user.refresh_from_db()
        assert request.session.session_key != old_key
        assert metadata.session_key == request.session.session_key
        assert request.session["cart"] == {"board": "saved"}
        assert request.session.get_expiry_date() == expiry
        assert request.session[HASH_SESSION_KEY] == user.get_session_auth_hash()
        assert Session.objects.get(session_key=request.session.session_key).expire_date == expiry
        assert not Session.objects.filter(session_key=old_key).exists()
        assert CachedDbSessionStore(old_key).load() == {}
        from apps.accounts.middleware import RotationSafeSessionMiddleware

        # Sending the committed replacement needs no second SQL/cache session save.
        with patch.object(request.session, "save", side_effect=AssertionError("Unexpected save")):
            response = RotationSafeSessionMiddleware(lambda req: response).process_response(
                request, response
            )
        assert response.cookies[settings.SESSION_COOKIE_NAME].value == request.session.session_key

        cookie = response.cookies[settings.SESSION_COOKIE_NAME]
        assert cookie["max-age"] == 15 * 60
        assert cookie["expires"] == http_date(expiry.timestamp())


@pytest.mark.parametrize("operation", ["reset", "change"])
def test_cache_and_broker_failure_preserve_committed_credentials_and_recoverable_intent(
    operation, verified_user_factory, csrf_request, caplog
) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    request, metadata = authenticated_request(user, csrf_request)
    old_key = request.session.session_key
    old_payload = CachedDbSessionStore(old_key).load()
    token = default_token_generator.make_token(user)
    with (
        patch.object(CachedDbSessionStore(old_key)._cache, "delete", side_effect=OSError("cache")),
        patch(
            "apps.accounts.services.send_password_security_notification.delay",
            side_effect=OSError("private-broker-details"),
        ),
    ):
        if operation == "change":
            response = PasswordChangeView.as_view()(request)
        else:
            response = PasswordResetConfirmView.as_view()(
                csrf_request(
                    "post",
                    "/api/v1/auth/password-reset/confirm/",
                    {
                        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
                        "token": token,
                        "new_password": NEW_PASSWORD,
                    },
                )
            )
    assert response.status_code == 204
    user.refresh_from_db()
    metadata.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert not Session.objects.filter(session_key=old_key).exists()
    assert CachedDbSessionStore(old_key).load() == old_payload
    assert "private-broker-details" not in caplog.text
    event = SecurityEvent.objects.get(event_type__in=tasks.PASSWORD_SECURITY_MESSAGES)
    assert event.metadata["security_email"] == {
        "status": "pending",
        "attempts": 0,
        "recipient": user.email,
    }
    assert OLD_PASSWORD not in str(event.metadata)
    assert NEW_PASSWORD not in str(event.metadata)
    assert token not in str(event.metadata)
    assert old_key not in str(event.metadata)
    if operation == "change":
        assert metadata.revoked_at is None
        assert SessionStore(request.session.session_key).load()[HASH_SESSION_KEY] == (
            user.get_session_auth_hash()
        )
    else:
        assert metadata.revoked_at is not None
    # Recover without requiring a successful original broker publication.
    assert tasks.recover_password_security_notifications.run() == 1
    assert tasks.send_password_security_notification.run(event.pk) is False
    event.refresh_from_db()
    assert event.metadata["security_email"]["status"] == "sent"
    assert len(mail.outbox) == 1


def test_committed_password_change_retains_browser_session_when_cache_purge_and_broker_fail(
    verified_user_factory,
) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    browser, other_browser = Client(), Client()
    for client in (browser, other_browser):
        assert (
            client.post(
                "/api/v1/auth/login/",
                {"email": user.email, "password": OLD_PASSWORD},
                content_type="application/json",
            ).status_code
            == 200
        )
    old_key = browser.cookies[settings.SESSION_COOKIE_NAME].value
    other_key = other_browser.cookies[settings.SESSION_COOKIE_NAME].value
    CachedDbSessionStore(other_key).load()
    with (
        patch.object(CachedDbSessionStore(old_key)._cache, "delete", side_effect=OSError("cache")),
        patch(
            "apps.accounts.services.send_password_security_notification.delay", side_effect=OSError
        ),
    ):
        response = browser.post(
            "/api/v1/auth/password-change/",
            {"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD},
            content_type="application/json",
        )
        assert response.status_code == 204
        assert response.cookies[settings.SESSION_COOKIE_NAME].value != old_key
        assert browser.get("/api/v1/auth/me/").status_code == 200
    assert other_browser.get("/api/v1/auth/me/").status_code == 401
    assert browser.get("/api/v1/auth/me/").status_code == 200


def test_authenticated_reset_skips_postcommit_metadata_write(verified_user_factory) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    browser = Client()
    assert (
        browser.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": OLD_PASSWORD},
            content_type="application/json",
        ).status_code
        == 200
    )
    user.refresh_from_db()
    token = default_token_generator.make_token(user)
    original_update = QuerySet.update

    def reject_metadata_touch(queryset, **kwargs):
        if queryset.model is SessionMetadata and set(kwargs) == {"last_seen_at"}:
            raise DatabaseError("Synthetic postcommit metadata fault")
        return original_update(queryset, **kwargs)

    with (
        patch.object(QuerySet, "update", reject_metadata_touch),
        patch("apps.accounts.services.send_password_security_notification.delay"),
    ):
        response = browser.post(
            "/api/v1/auth/password-reset/confirm/",
            {
                "uid": urlsafe_base64_encode(force_bytes(user.pk)),
                "token": token,
                "new_password": NEW_PASSWORD,
            },
            content_type="application/json",
        )
    assert response.status_code == 204
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert browser.get("/api/v1/auth/me/").status_code == 401


def test_security_email_transport_failure_backs_off_and_uses_original_recipient(
    verified_user_factory,
) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    original_email = user.email
    with patch("apps.accounts.services.send_password_security_notification.delay"):
        services.reset_password(
            user_id=str(user.pk),
            token=default_token_generator.make_token(user),
            new_password=NEW_PASSWORD,
        )
    event = SecurityEvent.objects.get(event_type=SecurityEvent.EventType.PASSWORD_RESET)
    User.objects.filter(pk=user.pk).update(email="replacement@example.test")
    with freeze_time("2026-10-08T10:00:00Z"):
        with patch("apps.accounts.tasks.send_mail", side_effect=OSError("SMTP unavailable")):
            assert tasks.send_password_security_notification.run(event.pk) is False
        event.refresh_from_db()
        assert event.metadata["security_email"]["status"] == "pending"
        assert event.metadata["security_email"]["attempts"] == 1
        with patch("apps.accounts.tasks.send_mail") as transport:
            assert tasks.recover_password_security_notifications.run() == 0
            transport.assert_not_called()
    with freeze_time("2026-10-08T10:03:00Z"):
        assert tasks.recover_password_security_notifications.run() == 1
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [original_email]
    assert mail.outbox[0].subject == "Your password was reset"


@pytest.mark.concurrency
@pytest.mark.skipif(connection.vendor != "postgresql", reason="Row locks require PostgreSQL.")
@pytest.mark.parametrize("operation", ["reset", "change"])
def test_concurrent_password_requests_have_one_winner(
    operation, verified_user_factory, csrf_request
) -> None:
    user = verified_user_factory(password=OLD_PASSWORD)
    request, _ = authenticated_request(user, csrf_request)
    old_key = request.session.session_key
    token = default_token_generator.make_token(user)
    barrier = Barrier(2)
    candidate_passwords = (token_urlsafe(24), token_urlsafe(24))

    def worker(number):
        close_old_connections()
        try:
            worker_request = RequestFactory().post("/api/v1/auth/password-change/")
            worker_request.user = User.objects.get(pk=user.pk)
            worker_request.session = CachedDbSessionStore(old_key)
            # Both requests carry the same original credential snapshot.
            dict(worker_request.session)
            barrier.wait(timeout=5)
            password = candidate_passwords[number]
            try:
                if operation == "reset":
                    services.reset_password(
                        user_id=str(user.pk), token=token, new_password=password
                    )
                else:
                    services.change_password(
                        worker_request, current_password=OLD_PASSWORD, new_password=password
                    )
            except ValidationError:
                return False
            return True
        finally:
            close_old_connections()

    with (
        patch("apps.accounts.services.send_password_security_notification.delay") as dispatch,
        ThreadPoolExecutor(max_workers=2) as executor,
    ):
        outcomes = list(executor.map(worker, range(2)))
    assert sorted(outcomes) == [False, True]
    assert (
        SecurityEvent.objects.filter(event_type__in=tasks.PASSWORD_SECURITY_MESSAGES).count() == 1
    )
    dispatch.assert_called_once()
