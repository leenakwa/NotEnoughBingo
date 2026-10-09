from __future__ import annotations

from secrets import token_urlsafe

import pytest
from django.core import mail

from apps.accounts.email_tokens import derive_verification_token
from apps.accounts.models import EmailVerification, SecurityEvent, User
from apps.accounts.services import request_email_change, verify_email
from apps.accounts.views import EmailChangeConfirmView, EmailChangeRequestView, RegisterView

pytestmark = pytest.mark.django_db


def email_at_length(length: int) -> str:
    # Keep every domain label and the local part valid at both storage boundaries.
    return f"{'a' * 64}@{'b' * 63}.{'c' * 63}.{'d' * (length - 198)}.test"


EMAIL_BOUNDARY_CASES = [
    pytest.param(email_at_length(254), id="254-accepted"),
    pytest.param(email_at_length(255), id="255-rejected"),
    pytest.param(
        f"{'a' * 64}@{'b' * 40}İ.{'c' * 63}.{'d' * 63}.{'e' * 14}.test",
        id="254-expands-to-255-rejected",
    ),
]


@pytest.mark.parametrize("email", EMAIL_BOUNDARY_CASES)
def test_registration_email_storage_boundary(
    email, csrf_request, django_capture_on_commit_callbacks
) -> None:
    password = token_urlsafe(24)
    with django_capture_on_commit_callbacks(execute=True):
        response = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {
                    "email": email,
                    "username": "boundary_person",
                    "password": password,
                },
            )
        )

    if len(email.lower()) > 254:
        assert response.status_code == 400
        assert response.data["error"]["details"]["email"][0]["code"] == "max_length"
        assert not User.objects.exists()
        assert not EmailVerification.objects.exists()
        assert not SecurityEvent.objects.exists()
        assert not mail.outbox
        return

    assert response.status_code == 202
    user = User.objects.get(email=email)
    verification = EmailVerification.objects.get(user=user)
    assert verification.email == email
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [email]
    verified = verify_email(derive_verification_token(verification))
    assert verified.email == email
    assert verified.is_active
    assert verified.check_password(password)


@pytest.mark.parametrize("email", EMAIL_BOUNDARY_CASES)
def test_email_change_storage_boundary(
    email, csrf_request, verified_user_factory, django_capture_on_commit_callbacks
) -> None:
    password = token_urlsafe(24)
    user = verified_user_factory(email="before@example.test", password=password)
    with django_capture_on_commit_callbacks(execute=True):
        request_email_change(user=user, new_email="pending@example.test", current_password=password)
    pending = EmailVerification.objects.get(user=user)
    original_outbox = list(mail.outbox)
    original_password = user.password
    original_event_count = SecurityEvent.objects.count()

    with django_capture_on_commit_callbacks(execute=True):
        response = EmailChangeRequestView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/email-change/",
                {"new_email": email, "current_password": password},
                user=user,
            )
        )
    user.refresh_from_db()
    pending.refresh_from_db()
    assert user.email == "before@example.test"
    assert user.password == original_password
    assert User.objects.count() == 1

    if len(email.lower()) > 254:
        assert response.status_code == 400
        assert response.data["error"]["details"]["new_email"][0]["code"] == "max_length"
        assert EmailVerification.objects.count() == 1
        assert pending.used_at is None
        assert SecurityEvent.objects.count() == original_event_count
        assert mail.outbox == original_outbox
        return

    assert response.status_code == 202
    assert pending.used_at is not None
    verification = EmailVerification.objects.get(user=user, used_at__isnull=True)
    assert verification.email == email
    assert len(mail.outbox) == len(original_outbox) + 1
    assert mail.outbox[-1].to == [email]
    confirmed = EmailChangeConfirmView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/email-change/confirm/",
            {"token": derive_verification_token(verification)},
        )
    )
    assert confirmed.status_code == 204
    user.refresh_from_db()
    assert user.email == email
    assert user.check_password(password)
