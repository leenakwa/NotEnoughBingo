from __future__ import annotations

import re
from datetime import timedelta
from email import policy
from email.parser import BytesParser
from smtplib import SMTPServerDisconnected

import pytest
from celery.exceptions import Retry
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from freezegun import freeze_time

from apps.accounts import tasks
from apps.accounts.models import AccountDeletionRequest, EmailVerification, SecurityEvent
from apps.accounts.services import token_digest

pytestmark = pytest.mark.django_db


@pytest.fixture
def public_mail_settings(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.DEFAULT_FROM_EMAIL = "Account notices <accounts@bingo.example.test>"
    settings.FRONTEND_URL = "https://bingo.example.test"
    return settings


def assert_plain_text_message(subject, recipient, expected_urls, settings):
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == subject
    assert message.from_email == settings.DEFAULT_FROM_EMAIL
    assert message.to == [recipient]
    assert not message.alternatives

    # Inspect the MIME a transport would receive, including its decoded payload.
    mime = BytesParser(policy=policy.default).parsebytes(message.message().as_bytes())
    assert mime["Subject"] == subject
    assert str(mime["From"]) == settings.DEFAULT_FROM_EMAIL
    assert str(mime["To"]) == recipient
    assert not mime.is_multipart()
    assert mime.get_content_type() == "text/plain"
    assert mime.get_content_charset() == "utf-8"
    assert mime.get_payload(decode=True).decode("utf-8") == message.body
    assert set(re.findall(r"https?://[^\s]+", message.body)) == set(expected_urls)
    return message


@pytest.mark.parametrize(
    ("purpose", "route", "subject"),
    [
        (
            EmailVerification.Purpose.VERIFY_EMAIL,
            "verify-email",
            "Verify your Not Enough Bingo email",
        ),
        (
            EmailVerification.Purpose.CHANGE_EMAIL,
            "confirm-email-change",
            "Confirm your new Not Enough Bingo email",
        ),
    ],
)
def test_verification_mail_mime_contract(
    purpose, route, subject, user_factory, public_mail_settings
):
    user = user_factory()
    verification_value = "synthetic-verification-value"
    recipient = "requested@example.test"
    verification = EmailVerification.objects.create(
        user=user,
        email=recipient,
        purpose=purpose,
        pending_username="Игрок",
        token_hash=token_digest(verification_value),
        expires_at=timezone.now() + timedelta(hours=1),
    )
    tasks.send_verification_email.run(verification.pk, verification_value)
    message = assert_plain_text_message(
        subject,
        recipient,
        [
            f"https://bingo.example.test/{route}?token={verification_value}",
            "https://bingo.example.test/support",
        ],
        public_mail_settings,
    )
    if purpose == EmailVerification.Purpose.VERIFY_EMAIL:
        assert "Игрок" in message.body


def test_password_reset_mail_mime_contract(user_factory, public_mail_settings):
    user = user_factory()
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    tasks.send_password_reset_email.run(user.pk, uid, token)
    assert_plain_text_message(
        "Reset your Not Enough Bingo password",
        user.email,
        [
            f"https://bingo.example.test/reset-password?uid={uid}&token={token}",
            "https://bingo.example.test/support",
        ],
        public_mail_settings,
    )


@pytest.mark.parametrize("kind", ["email_change_notice", "security"])
def test_direct_account_notice_mime_contract(kind, user_factory, public_mail_settings):
    user = user_factory()
    if kind == "email_change_notice":
        recipient = "former@example.test"
        subject = "Your Not Enough Bingo email address changed"
        tasks.send_email_change_notice.run(recipient)
    else:
        recipient = user.email
        subject = "Security notice"
        tasks.send_critical_security_email.run(user.pk, subject, "Review your account — проверьте.")
    message = assert_plain_text_message(
        subject, recipient, ["https://bingo.example.test/support"], public_mail_settings
    )
    if kind == "security":
        assert "проверьте" in message.body


@pytest.mark.parametrize(
    ("event_type", "intent_key", "subject"),
    [
        (SecurityEvent.EventType.PASSWORD_RESET, "security_email", "Your password was reset"),
        (SecurityEvent.EventType.PASSWORD_CHANGED, "security_email", "Your password changed"),
        (SecurityEvent.EventType.EMAIL_CHANGED, "security_email", "Your email address changed"),
        (
            SecurityEvent.EventType.EMAIL_CHANGED,
            "previous_email_notice",
            "Your Not Enough Bingo email address changed",
        ),
        (
            SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED,
            "security_email",
            "Account deletion requested",
        ),
    ],
)
def test_persisted_account_notice_mime_contract(
    event_type, intent_key, subject, user_factory, public_mail_settings
):
    user = user_factory()
    recipient = "former@example.test" if intent_key == "previous_email_notice" else user.email
    intent = {"status": "pending", "recipient": recipient}
    if event_type == SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED:
        deletion = AccountDeletionRequest.objects.create(
            user=user, scheduled_for=timezone.now() + timedelta(days=7)
        )
        intent.update(
            deletion_request_id=deletion.pk, scheduled_for=deletion.scheduled_for.isoformat()
        )
    event = SecurityEvent.objects.create(
        user=user, event_type=event_type, metadata={intent_key: intent}
    )
    assert tasks._deliver_security_notification(event.pk, intent_key) is True
    message = assert_plain_text_message(
        subject, recipient, ["https://bingo.example.test/support"], public_mail_settings
    )
    event.refresh_from_db()
    assert event.metadata[intent_key]["status"] == "sent"
    if event_type == SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED:
        assert deletion.scheduled_for.strftime("%Y-%m-%d %H:%M UTC") in message.body


def email_job(kind, user):
    if kind == "verification":
        verification_value = "synthetic-verification-value"
        verification = EmailVerification.objects.create(
            user=user,
            email=user.email,
            token_hash=token_digest(verification_value),
            expires_at=timezone.now() + timedelta(hours=1),
        )
        return tasks.send_verification_email, (verification.pk, verification_value)
    if kind == "reset":
        return tasks.send_password_reset_email, (
            user.pk,
            urlsafe_base64_encode(force_bytes(user.pk)),
            default_token_generator.make_token(user),
        )
    if kind == "email_change_notice":
        return tasks.send_email_change_notice, ("former@example.test",)
    return tasks.send_critical_security_email, (user.pk, "Security notice", "Review your account.")


@pytest.mark.parametrize("kind", ["verification", "reset", "email_change_notice", "security"])
@pytest.mark.parametrize("permanent_failure", [False, True])
def test_email_tasks_retry_transport_failures_and_finish_truthfully(
    kind, permanent_failure, verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory()
    task, args = email_job(kind, user)
    original_send = tasks.send_mail
    attempts = []

    def faulty_transport(*send_args, **kwargs):
        attempts.append(True)
        if permanent_failure or len(attempts) <= 2:
            raise SMTPServerDisconnected("Synthetic mail transport unavailable")
        assert kwargs["fail_silently"] is False
        return original_send(*send_args, **kwargs)

    monkeypatch.setattr(tasks, "send_mail", faulty_transport)
    # Exercise the installed retry wrapper without publishing or waiting on a broker.
    for retry_number in range(6 if permanent_failure else 3):
        task.push_request(
            called_directly=False,
            is_eager=True,
            retries=retry_number,
            args=args,
            kwargs={},
            delivery_info={},
        )
        try:
            if permanent_failure and retry_number == 5:
                with pytest.raises(SMTPServerDisconnected):
                    task.run(*args)
            elif permanent_failure or retry_number < 2:
                with pytest.raises(Retry) as retry:
                    task.run(*args)
                assert 0 <= retry.value.when <= 2**retry_number
            else:
                assert task.run(*args) is None
        finally:
            task.pop_request()
    assert len(attempts) == (6 if permanent_failure else 3)
    assert len(mail.outbox) == (0 if permanent_failure else 1)
    if not permanent_failure:
        expected_recipient = "former@example.test" if kind == "email_change_notice" else user.email
        assert mail.outbox[0].to == [expected_recipient]
    user.refresh_from_db()
    assert user.is_active
    assert user.is_email_verified


@pytest.mark.parametrize("invalidated_by", ["timeout", "password_change"])
def test_queued_password_reset_mail_does_not_send_invalidated_link(
    invalidated_by, verified_user_factory, settings
) -> None:
    settings.PASSWORD_RESET_TIMEOUT = 60
    user = verified_user_factory()
    with freeze_time("2026-10-03T01:00:00Z"):
        token = default_token_generator.make_token(user)
    if invalidated_by == "password_change":
        user.set_password("Changed-Strong-Password-84")
        user.save(update_fields=["password"])
    with freeze_time(
        "2026-10-03T01:02:00Z" if invalidated_by == "timeout" else "2026-10-03T01:00:30Z"
    ):
        tasks.send_password_reset_email.run(
            user.pk, urlsafe_base64_encode(force_bytes(user.pk)), token
        )
    assert len(mail.outbox) == 0


@pytest.mark.parametrize(
    "purpose", [EmailVerification.Purpose.VERIFY_EMAIL, EmailVerification.Purpose.CHANGE_EMAIL]
)
def test_verification_mail_uses_the_actual_stored_expiration(purpose, verified_user_factory):
    user = verified_user_factory()
    with freeze_time("2026-10-03T01:00:00Z"):
        verification = EmailVerification.objects.create(
            user=user,
            email=user.email,
            purpose=purpose,
            token_hash=token_digest("synthetic-verification-value"),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        tasks.send_verification_email.run(verification.pk, "synthetic-verification-value")
    assert len(mail.outbox) == 1
    assert "2026-10-03 01:15 UTC" in mail.outbox[0].body
    assert "24 hours" not in mail.outbox[0].body


@pytest.mark.parametrize("state", ["used", "expired", "missing"])
def test_queued_verification_email_skips_unusable_requests(state, verified_user_factory):
    user = verified_user_factory()
    task, args = email_job("verification", user)
    verification = EmailVerification.objects.get(pk=args[0])
    if state == "used":
        verification.used_at = timezone.now()
        verification.save(update_fields=["used_at"])
    elif state == "expired":
        verification.expires_at = timezone.now() - timedelta(seconds=1)
        verification.save(update_fields=["expires_at"])
    else:
        verification.delete()
    task.run(*args)
    assert len(mail.outbox) == 0
