from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.backends.cached_db import SessionStore as CachedDbSessionStore
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.middleware import SessionMiddleware
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import (
    EmailVerification,
    NotificationPreference,
    SecurityEvent,
    SessionMetadata,
    User,
    UserPrivacySettings,
    UserProfile,
)
from apps.accounts.serializers import PrivacySerializer, UserProfileReadSerializer
from apps.accounts.services import (
    create_authenticated_session,
    issue_email_verification,
    revoke_session,
    token_digest,
    verify_email,
)
from apps.accounts.views import (
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


def test_user_creation_normalizes_identity_and_creates_account_relations(user_factory) -> None:
    user = user_factory(username="  Mixed_Case  ", email="Mixed@EXAMPLE.TEST")

    assert user.username == "mixed_case"
    assert user.email == "mixed@example.test"
    assert UserProfile.objects.filter(user=user).exists()
    assert UserPrivacySettings.objects.filter(user=user).exists()
    assert NotificationPreference.objects.filter(user=user).exists()


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
    assert public_data["created_bingos"] is None

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
