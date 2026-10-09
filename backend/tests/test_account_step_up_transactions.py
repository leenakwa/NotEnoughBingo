from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from secrets import token_urlsafe
from threading import Event
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib.auth import HASH_SESSION_KEY
from django.contrib.auth.hashers import make_password
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.models import Session
from django.db import close_old_connections, connection, transaction
from django.utils import timezone

from apps.accounts import services
from apps.accounts.models import AccountDeletionRequest, EmailVerification, SecurityEvent, User
from apps.accounts.serializers import AccountDeletionSerializer, EmailChangeRequestSerializer
from apps.accounts.views import AccountDeletionView, EmailChangeRequestView

pytestmark = pytest.mark.django_db(transaction=True)


def step_up_request(operation, user, password, csrf_request):
    if operation == "email_change":
        return EmailChangeRequestView, csrf_request(
            "post",
            "/api/v1/auth/email-change/",
            {"new_email": "replacement@example.test", "current_password": password},
            user=user,
        )
    return AccountDeletionView, csrf_request(
        "post", "/api/v1/auth/account-deletion/", {"password": password}, user=user
    )


def pending_email_link(user):
    return EmailVerification.objects.create(
        user=user,
        email="earlier-address@example.test",
        purpose=EmailVerification.Purpose.CHANGE_EMAIL,
        token_hash=services.token_digest(token_urlsafe(24)),
        expires_at=timezone.now() + timedelta(hours=1),
    )


def assert_password_error(response, operation):
    field = "current_password" if operation == "email_change" else "password"
    message = (
        "The current password is incorrect."
        if operation == "email_change"
        else "The password is incorrect."
    )
    assert response.status_code == 400
    assert response.data["error"]["details"] == {field: [{"message": message, "code": "invalid"}]}


@pytest.mark.parametrize("operation", ["email_change", "deletion"])
def test_stale_authenticated_password_snapshot_cannot_create_account_intent(
    operation, verified_user_factory, csrf_request
) -> None:
    old_password, new_password = token_urlsafe(24), token_urlsafe(24)
    stale_user = verified_user_factory(password=old_password)
    prior_link = pending_email_link(stale_user)
    view, request = step_up_request(operation, stale_user, old_password, csrf_request)
    User.objects.filter(pk=stale_user.pk).update(password=make_password(new_password))

    with (
        patch("apps.accounts.services.send_verification_notification.delay") as verification_mail,
        patch("apps.accounts.services.send_account_security_notifications.delay") as notice_mail,
    ):
        response = view.as_view()(request)

    assert_password_error(response, operation)
    prior_link.refresh_from_db()
    fresh_user = User.objects.get(pk=stale_user.pk)
    assert fresh_user.check_password(new_password)
    assert fresh_user.email == stale_user.email
    assert fresh_user.deletion_requested_at is None
    assert fresh_user.deletion_scheduled_for is None
    assert prior_link.used_at is None
    assert EmailVerification.objects.filter(user=stale_user).count() == 1
    assert not AccountDeletionRequest.objects.filter(user=stale_user).exists()
    assert not SecurityEvent.objects.filter(user=stale_user).exists()
    verification_mail.assert_not_called()
    notice_mail.assert_not_called()


def test_existing_deletion_request_still_requires_current_locked_password(
    verified_user_factory, csrf_request
) -> None:
    old_password, new_password = token_urlsafe(24), token_urlsafe(24)
    stale_user = verified_user_factory(password=old_password)
    with patch("apps.accounts.services.send_account_security_notifications.delay"):
        deletion = services.schedule_account_deletion(stale_user, password=old_password)
    event = SecurityEvent.objects.get(user=stale_user)
    original_metadata = event.metadata
    User.objects.filter(pk=stale_user.pk).update(password=make_password(new_password))
    view, request = step_up_request("deletion", stale_user, old_password, csrf_request)

    with patch("apps.accounts.services.send_account_security_notifications.delay") as notice_mail:
        response = view.as_view()(request)

    assert_password_error(response, "deletion")
    assert AccountDeletionRequest.objects.get(user=stale_user).pk == deletion.pk
    event.refresh_from_db()
    assert event.metadata == original_metadata
    assert SecurityEvent.objects.filter(user=stale_user).count() == 1
    notice_mail.assert_not_called()


@pytest.mark.parametrize("operation", ["email_change", "deletion"])
def test_serializer_precheck_cannot_upgrade_and_restore_stale_password_hash(
    operation, verified_user_factory, settings
) -> None:
    settings.PASSWORD_HASHERS = [
        "django.contrib.auth.hashers.PBKDF2PasswordHasher",
        "django.contrib.auth.hashers.MD5PasswordHasher",
    ]
    old_password, new_password = token_urlsafe(24), token_urlsafe(24)
    stale_user = verified_user_factory(password=old_password)
    stale_user.password = make_password(old_password, hasher="md5")
    User.objects.filter(pk=stale_user.pk).update(password=stale_user.password)
    replacement_hash = make_password(new_password)
    User.objects.filter(pk=stale_user.pk).update(password=replacement_hash)
    serializer_class = (
        EmailChangeRequestSerializer if operation == "email_change" else AccountDeletionSerializer
    )
    data = (
        {"new_email": "replacement@example.test", "current_password": old_password}
        if operation == "email_change"
        else {"password": old_password}
    )
    serializer = serializer_class(data=data, context={"request": SimpleNamespace(user=stale_user)})

    assert serializer.is_valid(), serializer.errors
    assert User.objects.get(pk=stale_user.pk).password == replacement_hash
    assert stale_user.password.startswith("md5$")


@pytest.mark.parametrize("operation", ["email_change", "deletion"])
def test_successful_step_up_preserves_legacy_password_and_session_auth_hash(
    operation, verified_user_factory, csrf_request, settings
) -> None:
    settings.PASSWORD_HASHERS = [
        "django.contrib.auth.hashers.PBKDF2PasswordHasher",
        "django.contrib.auth.hashers.MD5PasswordHasher",
    ]
    password = token_urlsafe(24)
    user = verified_user_factory(password=None)
    legacy_hash = make_password(password, hasher="md5")
    user.password = legacy_hash
    user.save(update_fields=("password",))
    request = csrf_request("post", "/api/v1/auth/account-deletion/", user=user, with_session=True)
    metadata = services.create_authenticated_session(request, user)
    request.session.save()
    session_key = request.session.session_key
    original_auth_hash = request.session[HASH_SESSION_KEY]

    with (
        patch("apps.accounts.services.send_verification_notification.delay"),
        patch("apps.accounts.services.send_account_security_notifications.delay"),
    ):
        if operation == "email_change":
            services.request_email_change(
                user=user, new_email="replacement@example.test", current_password=password
            )
        else:
            services.schedule_account_deletion(user, password=password)

    user.refresh_from_db()
    metadata.refresh_from_db()
    assert user.password == legacy_hash
    assert user.get_session_auth_hash() == original_auth_hash
    assert request.session[HASH_SESSION_KEY] == original_auth_hash
    if operation == "email_change":
        assert metadata.revoked_at is None
        assert Session.objects.get(session_key=session_key).get_decoded()[HASH_SESSION_KEY] == (
            original_auth_hash
        )
        assert EmailVerification.objects.filter(
            user=user, email="replacement@example.test"
        ).exists()
    else:
        assert metadata.revoked_at is not None
        assert not Session.objects.filter(session_key=session_key).exists()
        assert AccountDeletionRequest.objects.filter(user=user).exists()


@pytest.mark.concurrency
@pytest.mark.skipif(connection.vendor != "postgresql", reason="Row locks require PostgreSQL.")
@pytest.mark.parametrize("operation", ["email_change", "deletion"])
def test_step_up_waiting_on_password_reset_rechecks_after_reset_commits(
    operation, verified_user_factory, csrf_request
) -> None:
    old_password, new_password = token_urlsafe(24), token_urlsafe(24)
    stale_user = verified_user_factory(password=old_password)
    prior_link = pending_email_link(stale_user)
    reset_token = default_token_generator.make_token(stale_user)
    view, request = step_up_request(operation, stale_user, old_password, csrf_request)
    password_updated, release_reset, step_up_reached_lock = Event(), Event(), Event()

    def reset():
        close_old_connections()
        try:
            with transaction.atomic():
                services.reset_password(
                    user_id=str(stale_user.pk), token=reset_token, new_password=new_password
                )
                password_updated.set()
                assert release_reset.wait(timeout=10)
        finally:
            close_old_connections()

    def attempt_step_up():
        close_old_connections()
        try:

            def observe_user_lock(execute, sql, params, many, context):
                if "accounts_user" in sql and "FOR UPDATE" in sql:
                    step_up_reached_lock.set()
                return execute(sql, params, many, context)

            with connection.execute_wrapper(observe_user_lock):
                return view.as_view()(request)
        finally:
            close_old_connections()

    with (
        patch("apps.accounts.services.send_password_security_notification.delay") as reset_mail,
        patch("apps.accounts.services.send_verification_notification.delay") as verification_mail,
        patch("apps.accounts.services.send_account_security_notifications.delay") as notice_mail,
        ThreadPoolExecutor(max_workers=2) as executor,
    ):
        reset_future = executor.submit(reset)
        try:
            assert password_updated.wait(timeout=5)
            step_up_future = executor.submit(attempt_step_up)
            # Reaching this SQL proves the stale serializer precheck already passed.
            assert step_up_reached_lock.wait(timeout=5)
            assert not step_up_future.done()
        finally:
            release_reset.set()
        reset_future.result(timeout=10)
        response = step_up_future.result(timeout=10)

    assert_password_error(response, operation)
    fresh_user = User.objects.get(pk=stale_user.pk)
    prior_link.refresh_from_db()
    assert fresh_user.check_password(new_password)
    assert fresh_user.deletion_requested_at is None
    assert prior_link.used_at is None
    assert EmailVerification.objects.filter(user=stale_user).count() == 1
    assert not AccountDeletionRequest.objects.filter(user=stale_user).exists()
    assert list(
        SecurityEvent.objects.filter(user=stale_user).values_list("event_type", flat=True)
    ) == [SecurityEvent.EventType.PASSWORD_RESET]
    reset_mail.assert_called_once()
    verification_mail.assert_not_called()
    notice_mail.assert_not_called()
