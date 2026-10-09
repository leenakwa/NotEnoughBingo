from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from secrets import token_urlsafe
from threading import Barrier, Event
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from django.core import mail
from django.db import DatabaseError, close_old_connections, connection
from django.utils import timezone
from freezegun import freeze_time

from apps.accounts import services, tasks
from apps.accounts.email_tokens import derive_verification_token, recover_verification_token
from apps.accounts.models import AccountDeletionRequest, EmailVerification, SecurityEvent, User
from apps.accounts.views import (
    AccountDeletionView,
    EmailChangeConfirmView,
    EmailChangeRequestView,
    RegisterView,
)

pytestmark = pytest.mark.django_db(transaction=True)
TEST_CREDENTIAL = token_urlsafe(24)


def pending_verification(user):
    with patch("apps.accounts.services.send_verification_notification.delay"):
        token = services.issue_email_verification(user)
    assert token is not None
    return EmailVerification.objects.get(token_hash=services.token_digest(token)), token


def pending_email_change(
    user, email="new-address@example.test", *, current_password=TEST_CREDENTIAL
):
    with patch("apps.accounts.services.send_verification_notification.delay"):
        services.request_email_change(user=user, new_email=email, current_password=current_password)
    verification = EmailVerification.objects.get(user=user, email=email, used_at__isnull=True)
    return verification, derive_verification_token(verification)


def completed_email_change(user, *, current_password=TEST_CREDENTIAL):
    verification, token = pending_email_change(user, current_password=current_password)
    with patch("apps.accounts.services.send_account_security_notifications.delay"):
        services.confirm_email_change(token)
    return verification, SecurityEvent.objects.get(
        user=user, event_type=SecurityEvent.EventType.EMAIL_CHANGED
    )


@pytest.mark.parametrize(
    "operation", ["registration", "email_request", "email_confirm", "deletion"]
)
def test_auth_email_sql_failure_rolls_back_mutation_intent_and_callbacks(
    operation, verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(password=TEST_CREDENTIAL)
    original_email = user.email
    original_verification = None
    token = None
    if operation in {"email_request", "email_confirm"}:
        original_verification, token = pending_email_change(user)
    original_save = EmailVerification.save
    original_create = SecurityEvent.objects.create

    def fail_verification_save(verification, *args, **kwargs):
        original_save(verification, *args, **kwargs)
        raise DatabaseError("Synthetic verification SQL fault")

    def fail_audit_create(**kwargs):
        original_create(**kwargs)
        raise DatabaseError("Synthetic audit SQL fault")

    if operation in {"registration", "email_request"}:
        monkeypatch.setattr(EmailVerification, "save", fail_verification_save)
    else:
        monkeypatch.setattr(SecurityEvent.objects, "create", fail_audit_create)

    def mutate():
        if operation == "registration":
            services.begin_registration(
                validated_data={
                    "email": "new-registration@example.test",
                    "username": "new_registration",
                    "password": token_urlsafe(24),
                }
            )
        elif operation == "email_request":
            services.request_email_change(
                user=user, new_email="replacement@example.test", current_password=TEST_CREDENTIAL
            )
        elif operation == "email_confirm":
            services.confirm_email_change(token)
        else:
            services.schedule_account_deletion(user, password=TEST_CREDENTIAL)

    with (
        patch(
            "apps.accounts.services.send_verification_notification.delay"
        ) as verification_publish,
        patch("apps.accounts.services.send_account_security_notifications.delay") as notice_publish,
        pytest.raises(DatabaseError),
    ):
        mutate()
    user.refresh_from_db()
    assert user.email == original_email
    assert user.deletion_requested_at is None
    assert not User.objects.filter(email="new-registration@example.test").exists()
    assert not EmailVerification.objects.filter(email="replacement@example.test").exists()
    assert not AccountDeletionRequest.objects.filter(user=user).exists()
    assert not SecurityEvent.objects.filter(
        event_type__in=(
            SecurityEvent.EventType.EMAIL_CHANGED,
            SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED,
        )
    ).exists()
    if original_verification:
        original_verification.refresh_from_db()
        assert original_verification.used_at is None
        assert recover_verification_token(original_verification) == token
    verification_publish.assert_not_called()
    notice_publish.assert_not_called()


@pytest.mark.parametrize(
    "operation", ["registration", "email_request", "email_confirm", "deletion"]
)
def test_auth_email_broker_failure_returns_committed_response_and_retains_recoverable_intent(
    operation, verified_user_factory, csrf_request, caplog
) -> None:
    password = token_urlsafe(24)
    user = verified_user_factory(password=password)
    original_email = user.email
    token = None
    if operation == "email_confirm":
        _, token = pending_email_change(user, current_password=password)
    with (
        patch(
            "apps.accounts.services.send_verification_notification.delay",
            side_effect=OSError("private-broker-credentials"),
        ) as verification_publish,
        patch(
            "apps.accounts.services.send_account_security_notifications.delay",
            side_effect=OSError("private-broker-credentials"),
        ) as notice_publish,
    ):
        if operation == "registration":
            response = RegisterView.as_view()(
                csrf_request(
                    "post",
                    "/api/v1/auth/register/",
                    {
                        "email": "pending-registration@example.test",
                        "username": "pending_reg",
                        "password": password,
                    },
                )
            )
        elif operation == "email_request":
            response = EmailChangeRequestView.as_view()(
                csrf_request(
                    "post",
                    "/api/v1/auth/email-change/",
                    {"new_email": "new-address@example.test", "current_password": password},
                    user=user,
                )
            )
        elif operation == "email_confirm":
            response = EmailChangeConfirmView.as_view()(
                csrf_request("post", "/api/v1/auth/email-change/confirm/", {"token": token})
            )
        else:
            response = AccountDeletionView.as_view()(
                csrf_request(
                    "post", "/api/v1/auth/account-deletion/", {"password": password}, user=user
                )
            )
    assert response.status_code == (204 if operation == "email_confirm" else 202)
    assert "private-broker-credentials" not in caplog.text
    publisher = (
        verification_publish if operation in {"registration", "email_request"} else notice_publish
    )
    publisher.assert_called_once()
    assert len(publisher.call_args.args) == 1
    assert isinstance(publisher.call_args.args[0], int)
    if operation in {"registration", "email_request"}:
        verification = EmailVerification.objects.get(delivery__status="pending")
        stable_token = recover_verification_token(verification)
        assert stable_token is not None
        assert stable_token not in str(verification.delivery)
        assert tasks.recover_account_email_notifications.run() == 1
        assert f"token={stable_token}" in mail.outbox[0].body
    else:
        event = SecurityEvent.objects.get(metadata__security_email__status="pending")
        assert event.metadata["security_email"]["recipient"] == (
            "new-address@example.test" if operation == "email_confirm" else original_email
        )
        assert tasks.recover_account_email_notifications.run() == (
            2 if operation == "email_confirm" else 1
        )


def test_verification_transport_failure_recovery_keeps_exact_link_expiry_and_cooldown(
    user_factory,
) -> None:
    now = timezone.now()
    with freeze_time(now):
        user = user_factory(password=TEST_CREDENTIAL)
        verification, token = pending_verification(user)
        original_expiry = verification.expires_at
        with patch(
            "apps.accounts.tasks.send_mail", side_effect=OSError("private-transport-details")
        ):
            assert tasks.send_verification_notification.run(verification.pk) is False
        verification.refresh_from_db()
        assert verification.delivery["status"] == "pending"
        assert verification.delivery["last_error_code"] == "mail_transport_failed"
        assert services.issue_email_verification(user) is None
        assert EmailVerification.objects.filter(user=user).count() == 1
        assert tasks.recover_account_email_notifications.run() == 0
    with freeze_time(now + timedelta(minutes=3)):
        assert tasks.recover_account_email_notifications.run() == 1
    verification.refresh_from_db()
    assert verification.expires_at == original_expiry
    assert verification.token_hash == services.token_digest(token)
    assert verification.delivery["status"] == "sent"
    assert len(mail.outbox) == 1
    link = next(line for line in mail.outbox[0].body.splitlines() if "?token=" in line)
    assert parse_qs(urlparse(link).query)["token"] == [token]
    assert tasks.send_verification_notification.run(verification.pk) is False
    assert services.verify_email(token).pk == user.pk


@pytest.mark.parametrize("state", ["expired", "used", "superseded", "email_changed", "verified"])
def test_verification_recovery_cancels_unusable_link(
    state, user_factory, verified_user_factory
) -> None:
    if state == "superseded":
        user = verified_user_factory(password=TEST_CREDENTIAL)
        verification, _ = pending_email_change(user)
        pending_email_change(user, "latest-address@example.test")
    else:
        user = user_factory(password=TEST_CREDENTIAL)
        verification, _ = pending_verification(user)
        if state == "expired":
            EmailVerification.objects.filter(pk=verification.pk).update(
                expires_at=timezone.now() - timedelta(seconds=1)
            )
        elif state == "used":
            EmailVerification.objects.filter(pk=verification.pk).update(used_at=timezone.now())
        elif state == "email_changed":
            User.objects.filter(pk=user.pk).update(email="other-address@example.test")
        else:
            User.objects.filter(pk=user.pk).update(email_verified_at=timezone.now())
    with patch("apps.accounts.tasks.send_mail") as transport:
        assert tasks.send_verification_notification.run(verification.pk) is False
    transport.assert_not_called()
    verification.refresh_from_db()
    assert verification.delivery["status"] == "cancelled"


@pytest.mark.parametrize("retain_key", [False, True])
def test_verification_rotation_uses_matching_fallback_and_never_replaces_original_hash(
    retain_key, user_factory, settings
) -> None:
    old_key, new_key = token_urlsafe(32), token_urlsafe(32)
    settings.SECRET_KEY = old_key
    settings.SECRET_KEY_FALLBACKS = []
    user = user_factory(password=TEST_CREDENTIAL)
    verification, token = pending_verification(user)
    original_hash = verification.token_hash
    settings.SECRET_KEY = new_key
    settings.SECRET_KEY_FALLBACKS = [old_key] if retain_key else []
    assert tasks.send_verification_notification.run(verification.pk) is retain_key
    verification.refresh_from_db()
    assert verification.token_hash == original_hash
    if retain_key:
        assert f"token={token}" in mail.outbox[0].body
    else:
        assert len(mail.outbox) == 0
        assert verification.delivery["status"] == "pending"
        assert verification.delivery["last_error_code"] == "token_key_unavailable"
        assert verification.delivery["attempts"] == 1
        assert services.verify_email(token).pk == user.pk


def test_legacy_raw_verification_task_is_compatible_but_cannot_reconstruct_or_send_wrong_token(
    user_factory,
) -> None:
    user = user_factory(password=TEST_CREDENTIAL)
    token = token_urlsafe(32)
    verification = EmailVerification.objects.create(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.VERIFY_EMAIL,
        token_hash=services.token_digest(token),
        expires_at=timezone.now() + timedelta(hours=1),
    )
    assert verification.delivery == {}
    assert recover_verification_token(verification) is None
    assert tasks.send_verification_notification.run(verification.pk) is False
    tasks.send_verification_email.run(verification.pk, token_urlsafe(32))
    assert len(mail.outbox) == 0
    tasks.send_verification_email.run(verification.pk, token)
    assert len(mail.outbox) == 1
    assert f"token={token}" in mail.outbox[0].body
    assert services.verify_email(token).pk == user.pk


@pytest.mark.parametrize("failed_recipient", ["old", "new"])
def test_email_change_notices_freeze_both_recipients_and_recover_independently(
    failed_recipient, verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(password=TEST_CREDENTIAL)
    old_email = user.email
    _, event = completed_email_change(user)
    User.objects.filter(pk=user.pk).update(email="later-address@example.test")
    failed_email = old_email if failed_recipient == "old" else "new-address@example.test"
    original_send = tasks.send_mail

    def fail_one_recipient(*args, **kwargs):
        if args[3] == [failed_email]:
            raise OSError("Synthetic recipient transport failure")
        return original_send(*args, **kwargs)

    now = timezone.now()
    with freeze_time(now):
        monkeypatch.setattr(tasks, "send_mail", fail_one_recipient)
        assert tasks.send_account_security_notifications.run(event.pk) == 1
        event.refresh_from_db()
        failed_slot = "previous_email_notice" if failed_recipient == "old" else "security_email"
        sent_slot = "security_email" if failed_recipient == "old" else "previous_email_notice"
        assert event.metadata[failed_slot]["status"] == "pending"
        assert event.metadata[sent_slot]["status"] == "sent"
        assert tasks.recover_account_email_notifications.run() == 0
    monkeypatch.setattr(tasks, "send_mail", original_send)
    with freeze_time(now + timedelta(minutes=3)):
        assert tasks.recover_account_email_notifications.run() == 1
    assert sorted(message.to[0] for message in mail.outbox) == sorted(
        [old_email, "new-address@example.test"]
    )
    assert tasks.send_account_security_notifications.run(event.pk) == 0


def test_cancelled_deletion_warning_is_not_sent_and_recipient_deadline_are_frozen(
    verified_user_factory,
) -> None:
    user = verified_user_factory(password=TEST_CREDENTIAL)
    with patch("apps.accounts.services.send_account_security_notifications.delay"):
        deletion = services.schedule_account_deletion(user, password=TEST_CREDENTIAL)
    event = SecurityEvent.objects.get(event_type=SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED)
    assert event.metadata["security_email"]["recipient"] == user.email
    assert event.metadata["security_email"]["scheduled_for"] == deletion.scheduled_for.isoformat()
    services.cancel_account_deletion(user)
    event.refresh_from_db()
    assert event.metadata["security_email"]["status"] == "cancelled"
    assert tasks.recover_account_email_notifications.run() == 0
    assert tasks.send_account_security_notifications.run(event.pk) == 0
    assert len(mail.outbox) == 0


def test_completed_deletion_erases_verification_delivery_and_notice_recipients(
    verified_user_factory,
) -> None:
    user = verified_user_factory(password=TEST_CREDENTIAL)
    pending_email_change(user)
    _, changed_event = completed_email_change(user)
    with patch("apps.accounts.services.send_account_security_notifications.delay"):
        deletion = services.schedule_account_deletion(user, password=TEST_CREDENTIAL)
    AccountDeletionRequest.objects.filter(pk=deletion.pk).update(
        scheduled_for=timezone.now() - timedelta(seconds=1)
    )
    assert tasks._process_account_deletion_request(deletion.pk) is True
    assert not EmailVerification.objects.filter(user=user).exists()
    changed_event.refresh_from_db()
    assert changed_event.metadata == {}
    assert changed_event.user_id is None
    assert tasks.recover_account_email_notifications.run() == 0
    assert len(mail.outbox) == 0


@pytest.mark.parametrize("kind", ["verification", "notice"])
def test_accepted_mail_remains_pending_when_database_acknowledgement_fails(
    kind, user_factory, verified_user_factory, monkeypatch
) -> None:
    if kind == "verification":
        user = user_factory(password=TEST_CREDENTIAL)
        record, token = pending_verification(user)
        original_save = EmailVerification.save
    else:
        user = verified_user_factory(password=TEST_CREDENTIAL)
        _, record = completed_email_change(user)
        token = None
        original_save = SecurityEvent.save

    def fail_after_ack(instance, *args, **kwargs):
        original_save(instance, *args, **kwargs)
        raise DatabaseError("Synthetic mail acknowledgement SQL fault")

    def deliver():
        if kind == "verification":
            return tasks.send_verification_notification.run(record.pk)
        return tasks._deliver_security_notification(record.pk)

    with monkeypatch.context() as fault:
        fault.setattr(
            EmailVerification if kind == "verification" else SecurityEvent, "save", fail_after_ack
        )
        with pytest.raises(DatabaseError):
            deliver()
    record.refresh_from_db()
    intent = record.delivery if kind == "verification" else record.metadata["security_email"]
    assert intent["status"] == "pending"
    assert len(mail.outbox) == 1
    assert deliver() is True
    assert len(mail.outbox) == 2
    if token:
        assert all(f"token={token}" in message.body for message in mail.outbox)


@pytest.mark.concurrency
@pytest.mark.skipif(connection.vendor != "postgresql", reason="Row locks require PostgreSQL.")
def test_concurrent_verification_delivery_and_recovery_send_one_message(user_factory) -> None:
    user = user_factory(password=TEST_CREDENTIAL)
    verification, _ = pending_verification(user)
    barrier = Barrier(2)

    def worker():
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            return tasks.send_verification_notification.run(verification.pk)
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: worker(), range(2)))
    assert sorted(results) == [False, True]
    assert len(mail.outbox) == 1


@pytest.mark.concurrency
@pytest.mark.skipif(connection.vendor != "postgresql", reason="Row locks require PostgreSQL.")
def test_deletion_cancellation_cannot_commit_before_inflight_notice_finishes(
    verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(password=TEST_CREDENTIAL)
    with patch("apps.accounts.services.send_account_security_notifications.delay"):
        services.schedule_account_deletion(user, password=TEST_CREDENTIAL)
    event = SecurityEvent.objects.get(event_type=SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED)
    sending, release, cancel_reached_event = Event(), Event(), Event()
    original_send = tasks.send_mail

    def blocked_transport(*args, **kwargs):
        sending.set()
        assert release.wait(timeout=10)
        return original_send(*args, **kwargs)

    monkeypatch.setattr(tasks, "send_mail", blocked_transport)

    def deliver():
        close_old_connections()
        try:
            return tasks.send_account_security_notifications.run(event.pk)
        finally:
            close_old_connections()

    def cancel():
        close_old_connections()
        try:

            def observe_lock(execute, sql, params, many, context):
                if "accounts_securityevent" in sql and "FOR UPDATE" in sql:
                    cancel_reached_event.set()
                return execute(sql, params, many, context)

            with connection.execute_wrapper(observe_lock):
                services.cancel_account_deletion(User.objects.get(pk=user.pk))
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        delivery = executor.submit(deliver)
        assert sending.wait(timeout=5)
        cancellation = executor.submit(cancel)
        try:
            assert cancel_reached_event.wait(timeout=5)
            assert not cancellation.done()
        finally:
            release.set()
        assert delivery.result(timeout=10) == 1
        cancellation.result(timeout=10)
    assert tasks.send_account_security_notifications.run(event.pk) == 0
    assert len(mail.outbox) == 1
