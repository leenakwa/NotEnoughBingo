from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.backends.cached_db import SessionStore as CachedDbSessionStore
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.middleware import SessionMiddleware
from django.core import mail
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.test import override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from freezegun import freeze_time
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.models import (
    EmailVerification,
    NotificationPreference,
    SecurityEvent,
    SessionMetadata,
    User,
    UserPrivacySettings,
    UserProfile,
)
from apps.accounts.security import LoginRateLimiter
from apps.accounts.serializers import PrivacySerializer, UserProfileReadSerializer
from apps.accounts.services import (
    confirm_email_change,
    create_authenticated_session,
    issue_email_verification,
    request_email_change,
    revoke_session,
    token_digest,
    verify_email,
)
from apps.accounts.tasks import (
    send_critical_security_email,
    send_email_change_notice,
    send_password_reset_email,
    send_verification_email,
)
from apps.accounts.views import (
    EmailChangeConfirmView,
    EmailChangeRequestView,
    LoginView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    SessionListView,
    SessionRevokeView,
)
from apps.common.authentication import StrictSessionAuthentication

pytestmark = pytest.mark.django_db


def test_session_status_is_guest_safe_and_never_cacheable(client, verified_user_factory) -> None:
    guest = client.get("/api/v1/auth/session/")
    assert guest.status_code == 200
    assert guest.data == {"user": None}
    assert guest["Cache-Control"] == "private, no-store"
    protected = client.get("/api/v1/auth/me/")
    assert protected.status_code == 401
    assert protected["WWW-Authenticate"] == 'Session realm="api"'

    user = verified_user_factory()
    client.force_login(user)
    signed_in = client.get("/api/v1/auth/session/")
    assert signed_in.status_code == 200
    assert signed_in.data["user"]["id"] == str(user.public_id)
    assert signed_in["Cache-Control"] == "private, no-store"


def test_session_status_does_not_consume_the_general_guest_quota(client, monkeypatch) -> None:
    monkeypatch.setitem(AnonRateThrottle.THROTTLE_RATES, "anon", "1/min")
    for _ in range(2):
        response = client.get("/api/v1/auth/session/", REMOTE_ADDR="192.0.2.203")
        assert response.status_code == 200
        assert response.data == {"user": None}


def test_user_creation_normalizes_identity_and_creates_account_relations(user_factory) -> None:
    user = user_factory(username="  Mixed_Case  ", email="Mixed@EXAMPLE.TEST")

    assert user.username == "mixed_case"
    assert user.email == "mixed@example.test"
    assert UserProfile.objects.filter(user=user).exists()
    assert UserPrivacySettings.objects.filter(user=user).exists()
    assert NotificationPreference.objects.filter(user=user).exists()


def test_email_change_requires_password_and_new_address_confirmation(
    csrf_request, verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(email="before@example.test")
    monkeypatch.setattr(
        "apps.accounts.services.secrets.token_urlsafe",
        lambda _: "new-email-token-long-enough-for-api-confirm",
    )
    path = "/api/v1/auth/email-change/"
    confirm_path = "/api/v1/auth/email-change/confirm/"

    wrong_password = EmailChangeRequestView.as_view()(
        csrf_request(
            "post",
            path,
            {"new_email": "after@example.test", "current_password": "wrong-password"},
            user=user,
        )
    )
    assert wrong_password.status_code == 400
    assert not EmailVerification.objects.filter(
        purpose=EmailVerification.Purpose.CHANGE_EMAIL
    ).exists()

    verified_user_factory(email="taken@example.test")
    hidden_address = EmailChangeRequestView.as_view()(
        csrf_request(
            "post",
            path,
            {"new_email": "taken@example.test", "current_password": "wrong-password"},
            user=user,
        )
    )
    assert hidden_address.status_code == 400
    assert "new_email" not in hidden_address.data

    requested = EmailChangeRequestView.as_view()(
        csrf_request(
            "post",
            path,
            {"new_email": "After@EXAMPLE.TEST", "current_password": "Correct-Horse-Battery-42"},
            user=user,
        )
    )
    assert requested.status_code == 202
    user.refresh_from_db()
    assert user.email == "before@example.test"
    verification = EmailVerification.objects.get(purpose=EmailVerification.Purpose.CHANGE_EMAIL)
    assert verification.email == "after@example.test"

    invalid = EmailChangeConfirmView.as_view()(
        csrf_request("post", confirm_path, {"token": "incorrect-token-long-enough-for-api-confirm"})
    )
    assert invalid.status_code == 400
    confirmed = EmailChangeConfirmView.as_view()(
        csrf_request("post", confirm_path, {"token": "new-email-token-long-enough-for-api-confirm"})
    )
    assert confirmed.status_code == 204
    user.refresh_from_db()
    verification.refresh_from_db()
    assert user.email == "after@example.test"
    assert authenticate(email="before@example.test", password="Correct-Horse-Battery-42") is None
    assert authenticate(email="after@example.test", password="Correct-Horse-Battery-42") == user
    assert verification.used_at is not None
    assert SecurityEvent.objects.filter(
        user=user, event_type=SecurityEvent.EventType.EMAIL_CHANGED
    ).exists()
    replay = EmailChangeConfirmView.as_view()(
        csrf_request("post", confirm_path, {"token": "new-email-token-long-enough-for-api-confirm"})
    )
    assert replay.status_code == 400


def test_email_change_rejects_an_address_taken_during_verification(
    csrf_request, verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(email="original@example.test")
    monkeypatch.setattr(
        "apps.accounts.services.secrets.token_urlsafe",
        lambda _: "pending-email-token-long-enough-for-confirm",
    )
    request = EmailChangeRequestView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/email-change/",
            {"new_email": "pending@example.test", "current_password": "Correct-Horse-Battery-42"},
            user=user,
        )
    )
    assert request.status_code == 202
    verified_user_factory(email="PENDING@example.test")
    confirm = EmailChangeConfirmView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/email-change/confirm/",
            {"token": "pending-email-token-long-enough-for-confirm"},
        )
    )
    assert confirm.status_code == 400
    user.refresh_from_db()
    assert user.email == "original@example.test"


def test_new_email_change_request_invalidates_earlier_link_and_expired_link(
    verified_user_factory, monkeypatch
) -> None:
    user = verified_user_factory(email="first@example.test")
    tokens = iter(
        ("first-email-change-token-value-123456", "second-email-change-token-value-12345")
    )
    monkeypatch.setattr("apps.accounts.services.secrets.token_urlsafe", lambda _: next(tokens))
    request_email_change(user=user, new_email="second@example.test")
    request_email_change(user=user, new_email="third@example.test")

    with pytest.raises(DjangoValidationError, match="already been used"):
        confirm_email_change("first-email-change-token-value-123456")

    latest = EmailVerification.objects.get(
        token_hash=token_digest("second-email-change-token-value-12345")
    )
    latest.expires_at = timezone.now() - timedelta(seconds=1)
    latest.save(update_fields=("expires_at",))
    with pytest.raises(DjangoValidationError, match="expired"):
        confirm_email_change("second-email-change-token-value-12345")
    user.refresh_from_db()
    assert user.email == "first@example.test"


def test_case_insensitive_identity_constraints_are_database_enforced(user_factory) -> None:
    user_factory(username="first_name", email="first@example.test")

    with pytest.raises(IntegrityError), transaction.atomic():
        user_factory(username="FIRST_NAME", email="another@example.test")

    with pytest.raises(IntegrityError), transaction.atomic():
        user_factory(username="second_name", email="FIRST@EXAMPLE.TEST")


def test_strict_session_authentication_enforces_csrf_for_anonymous_unsafe_requests(
    api_request_factory: APIRequestFactory,
) -> None:
    unsafe = Request(
        api_request_factory.post("/api/v1/auth/register/", {}, format="json"),
        parsers=[JSONParser()],
    )

    with pytest.raises(PermissionDenied, match="CSRF Failed"):
        StrictSessionAuthentication().authenticate(unsafe)

    raw_request = api_request_factory.post("/api/v1/auth/register/", {}, format="json")
    raw_request.user = AnonymousUser()
    token = get_token(raw_request)
    raw_request.COOKIES[settings.CSRF_COOKIE_NAME] = raw_request.META["CSRF_COOKIE"]
    raw_request.META["HTTP_X_CSRFTOKEN"] = token

    request = Request(raw_request, parsers=[JSONParser()])
    assert StrictSessionAuthentication().authenticate(request) is None


def test_registration_is_anti_enumerating_and_creates_a_verification(
    csrf_request,
) -> None:
    payload = {
        "email": "new-person@example.test",
        "username": "new_person",
        "display_name": "New Person",
        "password": "Strong-and-Unique-Pass-42",
    }

    first = RegisterView.as_view()(csrf_request("post", "/api/v1/auth/register/", payload))
    second = RegisterView.as_view()(csrf_request("post", "/api/v1/auth/register/", payload))

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.data == second.data == {"status": "verification_required"}
    user = User.objects.get(email=payload["email"])
    assert user.profile.display_name == ""
    assert user.is_active is False
    assert not user.has_usable_password()
    attempts = user.email_verifications.filter(used_at__isnull=True)
    assert attempts.count() == 2
    assert set(attempts.values_list("pending_username", flat=True)) == {"new_person"}


def test_existing_verified_email_does_not_disclose_the_account_or_change_it(
    csrf_request,
    verified_user_factory,
) -> None:
    existing = verified_user_factory(email="already@example.test")
    old_password = existing.password
    response = RegisterView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/register/",
            {
                "email": existing.email.upper(),
                "username": "fresh_choice",
                "password": "Strong-and-Unique-Pass-42",
            },
        )
    )

    assert response.status_code == 202
    assert response.data == {"status": "verification_required"}
    existing.refresh_from_db()
    assert existing.password == old_password
    assert not existing.email_verifications.exists()
    assert User.objects.filter(email__iexact=existing.email).count() == 1


def test_registration_rejects_weak_or_username_similar_passwords(csrf_request) -> None:
    base = {"email": "new@example.test", "username": "bingo_creator"}
    for password in ("short", "password123456789", "bingo_creator_2026"):
        response = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {**base, "password": password},
            )
        )
        assert response.status_code == 400
        assert "password" in response.data["error"]["details"]
    assert not User.objects.filter(email=base["email"]).exists()


def test_registration_without_csrf_is_rejected(api_request_factory: APIRequestFactory) -> None:
    response = RegisterView.as_view()(
        api_request_factory.post(
            "/api/v1/auth/register/",
            {
                "email": "csrf@example.test",
                "username": "csrf_user",
                "password": "Strong-and-Unique-Pass-42",
            },
            format="json",
        )
    )

    assert response.status_code == 403
    assert not User.objects.filter(email="csrf@example.test").exists()


def test_verification_resend_cooldown_preserves_the_existing_link(user_factory) -> None:
    user = user_factory()

    first_token = issue_email_verification(user)
    second_token = issue_email_verification(user)

    first = EmailVerification.objects.get(token_hash=token_digest(first_token))
    assert second_token is None
    assert first.used_at is None
    assert first.expires_at > timezone.now()


def test_hostile_pre_registration_cannot_choose_the_verified_password(
    csrf_request,
) -> None:
    email = "victim@example.test"
    attacker_link = "attacker-registration-token-with-enough-entropy"
    victim_link = "victim-registration-token-with-enough-entropy-xx"
    with patch(
        "apps.accounts.services.secrets.token_urlsafe",
        side_effect=[attacker_link, victim_link],
    ):
        attacker = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {
                    "email": email,
                    "username": "attacker_choice",
                    "password": "Attacker-Known-Password-42",
                },
            )
        )
        victim = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {
                    "email": email,
                    "username": "victim_choice",
                    "display_name": "Victim",
                    "password": "Victim-Owned-Password-84",
                },
            )
        )

    assert attacker.status_code == victim.status_code == 202
    pending = User.objects.get(email=email)
    assert pending.is_active is False
    assert not pending.has_usable_password()

    verified = verify_email(victim_link)

    verified.refresh_from_db()
    assert verified.is_active is True
    assert verified.username == "victim_choice"
    assert verified.profile.display_name == "Victim"
    assert verified.check_password("Victim-Owned-Password-84")
    assert not verified.check_password("Attacker-Known-Password-42")
    with pytest.raises(DjangoValidationError, match="invalid or has already been used"):
        verify_email(attacker_link)


def test_email_verification_is_one_time_and_records_security_event(user_factory) -> None:
    user = user_factory()
    token = issue_email_verification(user)

    verified = verify_email(token)

    verified.refresh_from_db()
    verification = EmailVerification.objects.get(token_hash=token_digest(token))
    assert verified.email_verified_at is not None
    assert verification.used_at is not None
    assert verification.attempt_count == 1
    assert (
        SecurityEvent.objects.filter(
            user=user,
            event_type=SecurityEvent.EventType.EMAIL_VERIFIED,
        ).count()
        == 1
    )
    with pytest.raises(DjangoValidationError, match="invalid or has already been used"):
        verify_email(token)


def test_expired_email_verification_records_failed_attempt(user_factory) -> None:
    user = user_factory()
    verification_value = "expired-token-with-enough-entropy-for-a-test"
    verification = EmailVerification.objects.create(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.VERIFY_EMAIL,
        token_hash=token_digest(verification_value),
        expires_at=timezone.now() - timedelta(seconds=1),
    )

    with pytest.raises(DjangoValidationError, match="expired"):
        verify_email(verification_value)

    verification.refresh_from_db()
    assert verification.attempt_count == 1
    assert user.email_verified_at is None


def test_login_has_generic_failure_and_success_creates_server_side_session(
    verified_user_factory,
    csrf_request,
) -> None:
    credential = "Strong-and-Unique-Pass-42"
    user = verified_user_factory(email="login@example.test", password=credential)
    wrong = LoginView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/login/",
            {"email": user.email, "password": "definitely-wrong"},
            with_session=True,
        )
    )
    unknown = LoginView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/login/",
            {"email": "unknown@example.test", "password": "definitely-wrong"},
            with_session=True,
        )
    )

    assert wrong.status_code == unknown.status_code == 400
    assert wrong.data["error"]["details"] == unknown.data["error"]["details"]

    valid_request = csrf_request(
        "post",
        "/api/v1/auth/login/",
        {"email": user.email.upper(), "password": credential},
        with_session=True,
    )
    response = LoginView.as_view()(valid_request)

    assert response.status_code == 200
    assert response.data["user"]["email"] == user.email
    metadata = SessionMetadata.objects.get(user=user, revoked_at__isnull=True)
    assert metadata.session_key == valid_request.session.session_key
    assert metadata.ip_hash
    assert SecurityEvent.objects.filter(
        user=user,
        event_type=SecurityEvent.EventType.LOGIN,
    ).exists()


def test_login_locks_repeated_failures_for_the_same_email(
    csrf_request,
    verified_user_factory,
    monkeypatch,
) -> None:
    user = verified_user_factory(email="limited@example.test")
    monkeypatch.setattr(LoginRateLimiter, "max_email_attempts", 2)
    endpoint = LoginView.as_view()
    payload = {"email": user.email, "password": "incorrect-password"}

    for _ in range(2):
        response = endpoint(csrf_request("post", "/api/v1/auth/login/", payload, with_session=True))
        assert response.status_code == 400
    limited = endpoint(csrf_request("post", "/api/v1/auth/login/", payload, with_session=True))
    assert limited.status_code == 429
    assert "Retry-After" in limited


def test_revoke_session_deletes_django_session_and_is_idempotent(user_factory) -> None:
    user = user_factory()
    request = APIRequestFactory().post(
        "/login/",
        HTTP_USER_AGENT="Mozilla/5.0 (Mac OS X) Chrome/120",
        REMOTE_ADDR="203.0.113.4",
    )
    request.user = AnonymousUser()
    SessionMiddleware(lambda req: None).process_request(request)

    metadata = create_authenticated_session(request, user)

    assert SessionStore().exists(metadata.session_key)
    assert metadata.device_name == "Chrome on macOS"
    revoke_session(user=user, session=metadata)
    revoke_session(user=user, session=metadata)

    metadata.refresh_from_db()
    assert metadata.revoked_at is not None
    assert not SessionStore().exists(metadata.session_key)
    assert (
        SecurityEvent.objects.filter(
            user=user,
            event_type=SecurityEvent.EventType.SESSION_REVOKED,
        ).count()
        == 2
    )


def test_revoke_session_invalidates_a_warmed_cached_db_session(user_factory) -> None:
    user = user_factory()
    request = APIRequestFactory().post("/login/")
    request.user = AnonymousUser()
    SessionMiddleware(lambda req: None).process_request(request)
    metadata = create_authenticated_session(request, user)
    request.session.save()

    warmed = CachedDbSessionStore(session_key=metadata.session_key).load()
    assert warmed["_auth_user_id"] == str(user.pk)

    revoke_session(user=user, session=metadata)

    assert CachedDbSessionStore(session_key=metadata.session_key).load() == {}


def test_session_api_lists_only_active_own_sessions_and_prevents_cross_user_revocation(
    user_factory,
) -> None:
    user = user_factory()
    other = user_factory()
    active_store = SessionStore()
    active_store.save()
    active = SessionMetadata.objects.create(
        user=user,
        session_key=active_store.session_key,
        user_agent="Current browser",
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )
    expired_store = SessionStore()
    expired_store.save()
    SessionMetadata.objects.create(
        user=user,
        session_key=expired_store.session_key,
        last_seen_at=timezone.now() - timedelta(days=3),
        expires_at=timezone.now() - timedelta(days=1),
    )
    foreign_store = SessionStore()
    foreign_store.save()
    foreign = SessionMetadata.objects.create(
        user=other,
        session_key=foreign_store.session_key,
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )
    factory = APIRequestFactory()
    list_request = factory.get("/api/v1/auth/sessions/")
    list_request.session = SessionStore(session_key=active_store.session_key)
    force_authenticate(list_request, user=user)

    listed = SessionListView.as_view()(list_request)

    assert listed.status_code == 200
    assert listed.data["count"] == 1
    assert listed.data["results"][0]["id"] == str(active.public_id)
    assert listed.data["results"][0]["current"] is True

    foreign_request = factory.delete(f"/api/v1/auth/sessions/{foreign.public_id}/")
    foreign_request.session = SessionStore(session_key=active_store.session_key)
    force_authenticate(foreign_request, user=user)
    denied = SessionRevokeView.as_view()(foreign_request, public_id=foreign.public_id)
    assert denied.status_code == 404
    foreign.refresh_from_db()
    assert foreign.revoked_at is None

    own_request = factory.delete(f"/api/v1/auth/sessions/{active.public_id}/")
    own_request.session = SessionStore(session_key=active_store.session_key)
    force_authenticate(own_request, user=user)
    revoked = SessionRevokeView.as_view()(own_request, public_id=active.public_id)
    assert revoked.status_code == 204
    active.refresh_from_db()
    assert active.revoked_at is not None


def test_password_reset_request_does_not_enumerate_accounts(user_factory, csrf_request) -> None:
    existing = user_factory(email="reset@example.test")

    with patch("apps.accounts.views.send_password_reset_email.delay") as send_reset:
        known = PasswordResetRequestView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/password-reset/",
                {"email": existing.email},
            )
        )
        unknown = PasswordResetRequestView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/password-reset/",
                {"email": "not-registered@example.test"},
            )
        )

    assert known.status_code == unknown.status_code == 202
    assert known.data == unknown.data
    send_reset.assert_called_once()


def test_password_reset_changes_password_and_revokes_every_active_session(
    user_factory,
    csrf_request,
) -> None:
    user = user_factory(password="Old-Strong-Password-42")
    session_store = SessionStore()
    session_store["_auth_user_id"] = str(user.pk)
    session_store.save()
    metadata = SessionMetadata.objects.create(
        user=user,
        session_key=session_store.session_key,
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    with patch("apps.accounts.views.send_critical_security_email.delay"):
        response = PasswordResetConfirmView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/password-reset/confirm/",
                {
                    "uid": uid,
                    "token": token,
                    "new_password": "New-Strong-Password-84",
                },
            )
        )

    assert response.status_code == 204
    user.refresh_from_db()
    metadata.refresh_from_db()
    assert user.check_password("New-Strong-Password-84")
    assert not user.check_password("Old-Strong-Password-42")
    assert metadata.revoked_at is not None
    assert not SessionStore().exists(session_store.session_key)
    assert SecurityEvent.objects.filter(
        user=user,
        event_type=SecurityEvent.EventType.PASSWORD_RESET,
    ).exists()


@override_settings(FRONTEND_URL="https://bingo.example.test")
def test_password_reset_email_uses_the_configured_public_origin(user_factory) -> None:
    user = user_factory()
    send_password_reset_email(user.pk, "example-uid", "example-token")

    assert len(mail.outbox) == 1
    assert "https://bingo.example.test/reset-password?uid=example-uid&token=example-token" in (
        mail.outbox[0].body
    )
    assert "https://bingo.example.test/support" in mail.outbox[0].body


@pytest.mark.parametrize(
    ("purpose", "route"),
    [
        (EmailVerification.Purpose.VERIFY_EMAIL, "verify-email"),
        (EmailVerification.Purpose.CHANGE_EMAIL, "confirm-email-change"),
    ],
)
@override_settings(FRONTEND_URL="https://bingo.example.test")
def test_verification_emails_include_the_public_support_destination(
    user_factory, purpose: str, route: str
) -> None:
    user = user_factory()
    verification = EmailVerification.objects.create(
        user=user,
        email=user.email,
        purpose=purpose,
        token_hash=token_digest("example-token"),
        expires_at=timezone.now() + timedelta(hours=1),
    )
    send_verification_email(verification.pk, "example-token")

    assert len(mail.outbox) == 1
    assert f"https://bingo.example.test/{route}?token=example-token" in mail.outbox[0].body
    assert "https://bingo.example.test/support" in mail.outbox[0].body


@override_settings(FRONTEND_URL="https://bingo.example.test")
def test_security_emails_include_the_public_support_destination(user_factory) -> None:
    user = user_factory()
    send_email_change_notice("former@example.test")
    send_critical_security_email(user.pk, "Security notice", "Check your account.")

    assert len(mail.outbox) == 2
    assert all("https://bingo.example.test/support" in message.body for message in mail.outbox)


@override_settings(PASSWORD_RESET_TIMEOUT=60)
def test_password_reset_token_expires_without_changing_credentials(
    user_factory, csrf_request
) -> None:
    user = user_factory(password="Old-Strong-Password-42")
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    with freeze_time("2026-09-30 10:00:00+00:00"):
        token = default_token_generator.make_token(user)

    with freeze_time("2026-09-30 10:01:01+00:00"):
        response = PasswordResetConfirmView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/password-reset/confirm/",
                {"uid": uid, "token": token, "new_password": "New-Strong-Password-84"},
            )
        )

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.check_password("Old-Strong-Password-42")


def test_password_change_preserves_current_session_and_revokes_other_sessions(
    user_factory,
    csrf_request,
) -> None:
    current_credential = "Old-Strong-Password-42"
    user = user_factory(password=current_credential)
    request = csrf_request(
        "post",
        "/api/v1/auth/password-change/",
        {
            "current_password": current_credential,
            "new_password": "New-Strong-Password-84",
        },
        user=user,
        with_session=True,
    )
    current_metadata = create_authenticated_session(request, user)
    other_store = SessionStore()
    other_store["_auth_user_id"] = str(user.pk)
    other_store.save()
    other_metadata = SessionMetadata.objects.create(
        user=user,
        session_key=other_store.session_key,
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )
    force_authenticate(request, user=user)

    with patch("apps.accounts.views.send_critical_security_email.delay"):
        response = PasswordChangeView.as_view()(request)

    assert response.status_code == 204
    user.refresh_from_db()
    current_metadata.refresh_from_db()
    other_metadata.refresh_from_db()
    assert user.check_password("New-Strong-Password-84")
    assert current_metadata.revoked_at is None
    assert current_metadata.session_key == request.session.session_key
    assert other_metadata.revoked_at is not None
    assert not SessionStore().exists(other_store.session_key)


def test_public_profile_obeys_bio_and_relationship_privacy(user_factory) -> None:
    owner = user_factory(username="private_person")
    follower = user_factory()
    owner.profile.display_name = "Private Person"
    owner.profile.bio = "This should be hidden"
    owner.profile.save()
    owner.privacy.show_bio = False
    owner.privacy.show_followers = False
    owner.privacy.show_following = False
    owner.privacy.show_created_bingos = False
    owner.privacy.save()
    from apps.accounts.models import Follow

    Follow.objects.create(follower=follower, following=owner)
    anonymous_request = APIRequestFactory().get("/profiles/private_person/")
    anonymous_request.user = AnonymousUser()

    public_data = UserProfileReadSerializer(
        owner.profile,
        context={"request": anonymous_request},
    ).data

    assert public_data["bio"] == ""
    assert public_data["follower_count"] == 0
    assert public_data["following_count"] == 0
    assert "created_bingos" not in public_data

    owner_request = APIRequestFactory().get("/profiles/me/")
    owner_request.user = owner
    owner_data = UserProfileReadSerializer(
        owner.profile,
        context={"request": owner_request},
    ).data
    assert owner_data["bio"] == "This should be hidden"
    assert owner_data["follower_count"] == 1


def test_privacy_serializer_supports_independent_settings(user_factory) -> None:
    user = user_factory()
    serializer = PrivacySerializer(
        user.privacy,
        data={
            "show_bio": False,
            "show_created_bingos": True,
            "show_play_history": False,
            "show_shared_results": True,
            "show_followers": False,
            "show_following": True,
        },
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()

    user.privacy.refresh_from_db()
    assert user.privacy.show_bio is False
    assert user.privacy.show_created_bingos is True
    assert user.privacy.show_play_history is False
    assert user.privacy.show_shared_results is True
    assert user.privacy.show_followers is False
    assert user.privacy.show_following is True
