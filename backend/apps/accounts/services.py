from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import login, logout
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.accounts.security import hash_sensitive, request_ip
from apps.accounts.session_management import invalidate_session_keys
from apps.accounts.tasks import send_critical_security_email, send_verification_email


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def issue_email_verification(
    user: User,
    *,
    pending_username: str = "",
    pending_display_name: str = "",
    pending_password_hash: str = "",
    respect_cooldown: bool = True,
) -> str | None:
    now = timezone.now()
    user = User.objects.select_for_update().get(pk=user.pk)
    recent_cutoff = now - timedelta(seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS)
    if (
        respect_cooldown
        and EmailVerification.objects.filter(
            user=user,
            purpose=EmailVerification.Purpose.VERIFY_EMAIL,
            used_at__isnull=True,
            created_at__gte=recent_cutoff,
        ).exists()
    ):
        return None
    daily_cutoff = now - timedelta(days=1)
    if (
        EmailVerification.objects.filter(
            user=user,
            purpose=EmailVerification.Purpose.VERIFY_EMAIL,
            created_at__gte=daily_cutoff,
        ).count()
        >= settings.EMAIL_VERIFICATION_MAX_PER_DAY
    ):
        return None
    token = secrets.token_urlsafe(32)
    verification = EmailVerification.objects.create(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.VERIFY_EMAIL,
        token_hash=token_digest(token),
        expires_at=now + timedelta(seconds=settings.EMAIL_VERIFICATION_TTL_SECONDS),
        pending_username=pending_username,
        pending_display_name=pending_display_name,
        pending_password_hash=pending_password_hash,
    )
    transaction.on_commit(lambda: send_verification_email.delay(verification.pk, token))
    return token


@transaction.atomic
def begin_registration(*, validated_data: dict) -> None:
    email = validated_data["email"].strip().lower()
    pending_password_hash = make_password(validated_data["password"])
    user = User.objects.select_for_update().filter(email__iexact=email).first()
    if user and user.email_verified_at is not None:
        return
    if user is None:
        placeholder = f"pending_{uuid.uuid4().hex}"
        user = User(username=placeholder, email=email, is_active=False)
        user.set_unusable_password()
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            user = User.objects.select_for_update().filter(email__iexact=email).first()
            if user is None or user.email_verified_at is not None:
                return
    issue_email_verification(
        user,
        pending_username=validated_data["username"].strip().lower(),
        pending_display_name=validated_data.get("display_name", "").strip(),
        pending_password_hash=pending_password_hash,
        respect_cooldown=False,
    )


@transaction.atomic
def resend_email_verification(email: str) -> None:
    user = (
        User.objects.select_for_update()
        .filter(
            email__iexact=email.strip().lower(),
            email_verified_at__isnull=True,
        )
        .first()
    )
    if not user:
        return
    latest = (
        EmailVerification.objects.filter(
            user=user,
            purpose=EmailVerification.Purpose.VERIFY_EMAIL,
            used_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    issue_email_verification(
        user,
        pending_username=latest.pending_username if latest else "",
        pending_display_name=latest.pending_display_name if latest else "",
        pending_password_hash=latest.pending_password_hash if latest else "",
    )


def verify_email(token: str) -> User:
    now = timezone.now()
    error: str | None = None
    user: User | None = None
    newly_verified = False
    with transaction.atomic():
        try:
            verification = (
                EmailVerification.objects.select_for_update()
                .select_related("user")
                .get(
                    token_hash=token_digest(token),
                    purpose=EmailVerification.Purpose.VERIFY_EMAIL,
                    used_at__isnull=True,
                )
            )
        except EmailVerification.DoesNotExist as exc:
            raise ValidationError(
                "The verification link is invalid or has already been used."
            ) from exc
        verification.attempt_count += 1
        user = verification.user
        if verification.expires_at <= now:
            verification.save(update_fields=("attempt_count", "updated_at"))
            error = "The verification link has expired."
        elif user.email.lower() != verification.email.lower():
            verification.save(update_fields=("attempt_count", "updated_at"))
            error = "The verification link no longer matches this account."
        elif user.email_verified_at is not None:
            verification.used_at = now
            verification.save(update_fields=("attempt_count", "used_at", "updated_at"))
        elif verification.pending_username and verification.pending_password_hash:
            username_taken = (
                User.objects.filter(username__iexact=verification.pending_username)
                .exclude(pk=user.pk)
                .exists()
            )
            if username_taken:
                verification.used_at = now
                verification.save(update_fields=("attempt_count", "used_at", "updated_at"))
                error = "The registration details are no longer available. Register again."
            else:
                user.username = verification.pending_username
                user.password = verification.pending_password_hash
                user.email_verified_at = now
                user.is_active = True
                user.save(
                    update_fields=(
                        "username",
                        "password",
                        "email_verified_at",
                        "is_active",
                    )
                )
                user.profile.display_name = verification.pending_display_name
                user.profile.save(update_fields=("display_name", "updated_at"))
                EmailVerification.objects.filter(
                    user=user,
                    purpose=EmailVerification.Purpose.VERIFY_EMAIL,
                    used_at__isnull=True,
                ).update(used_at=now)
                verification.save(update_fields=("attempt_count", "updated_at"))
                newly_verified = True
                SecurityEvent.objects.create(
                    user=user,
                    event_type=SecurityEvent.EventType.REGISTERED,
                )
        else:
            user.email_verified_at = now
            user.is_active = True
            user.save(update_fields=("email_verified_at", "is_active"))
            EmailVerification.objects.filter(
                user=user,
                purpose=EmailVerification.Purpose.VERIFY_EMAIL,
                used_at__isnull=True,
            ).update(used_at=now)
            verification.save(update_fields=("attempt_count", "updated_at"))
            newly_verified = True
        if not error and newly_verified:
            SecurityEvent.objects.create(
                user=user,
                event_type=SecurityEvent.EventType.EMAIL_VERIFIED,
            )
    if error:
        raise ValidationError(error)
    assert user is not None
    return user


def _device_name(user_agent: str) -> str:
    normalized = user_agent.lower()
    browser = "Browser"
    for needle, label in (
        ("edg/", "Edge"),
        ("firefox/", "Firefox"),
        ("chrome/", "Chrome"),
        ("safari/", "Safari"),
    ):
        if needle in normalized:
            browser = label
            break
    os_name = "Unknown OS"
    for needle, label in (
        ("iphone", "iPhone"),
        ("android", "Android"),
        ("mac os", "macOS"),
        ("windows", "Windows"),
        ("linux", "Linux"),
    ):
        if needle in normalized:
            os_name = label
            break
    return f"{browser} on {os_name}"


@transaction.atomic
def create_authenticated_session(request, user: User) -> SessionMetadata:  # type: ignore[no-untyped-def]
    login(request, user)
    if not request.session.session_key:
        request.session.save()
    now = timezone.now()
    user_agent = request.headers.get("User-Agent", "")[:500]
    metadata, _ = SessionMetadata.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={
            "user": user,
            "ip_hash": hash_sensitive(request_ip(request)),
            "user_agent": user_agent,
            "device_name": _device_name(user_agent),
            "last_seen_at": now,
            "expires_at": now + timedelta(seconds=settings.SESSION_COOKIE_AGE),
            "revoked_at": None,
        },
    )
    SecurityEvent.objects.create(
        user=user,
        event_type=SecurityEvent.EventType.LOGIN,
        ip_hash=metadata.ip_hash,
        user_agent=user_agent,
        metadata={"session_public_id": str(metadata.public_id)},
    )
    return metadata


def destroy_authenticated_session(request) -> None:  # type: ignore[no-untyped-def]
    if request.session.session_key:
        SessionMetadata.objects.filter(session_key=request.session.session_key).update(
            revoked_at=timezone.now()
        )
    logout(request)


@transaction.atomic
def revoke_session(*, user: User, session: SessionMetadata) -> None:
    locked = SessionMetadata.objects.select_for_update().get(pk=session.pk, user=user)
    if locked.revoked_at is None:
        locked.revoked_at = timezone.now()
        locked.save(update_fields=("revoked_at", "updated_at"))
    invalidate_session_keys((locked.session_key,))
    SecurityEvent.objects.create(
        user=user,
        event_type=SecurityEvent.EventType.SESSION_REVOKED,
        metadata={"session_public_id": str(locked.public_id)},
    )


@transaction.atomic
def schedule_account_deletion(user: User) -> AccountDeletionRequest:
    now = timezone.now()
    user = User.objects.select_for_update().get(pk=user.pk)
    grace_days = settings.ACCOUNT_DELETION_GRACE_DAYS
    scheduled_for = now + timedelta(days=grace_days)
    AccountDeletionRequest.objects.filter(
        user=user, status=AccountDeletionRequest.Status.SCHEDULED
    ).update(status=AccountDeletionRequest.Status.CANCELLED)
    deletion = AccountDeletionRequest.objects.create(
        user=user,
        status=AccountDeletionRequest.Status.SCHEDULED,
        scheduled_for=scheduled_for,
    )
    user.deletion_requested_at = now
    user.deletion_scheduled_for = scheduled_for
    user.save(update_fields=("deletion_requested_at", "deletion_scheduled_for"))
    active_session_keys = list(
        user.session_metadata.filter(revoked_at__isnull=True).values_list(
            "session_key",
            flat=True,
        )
    )
    user.session_metadata.filter(revoked_at__isnull=True).update(revoked_at=now)
    invalidate_session_keys(active_session_keys)
    SecurityEvent.objects.create(
        user=user, event_type=SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED
    )
    transaction.on_commit(
        lambda: send_critical_security_email.delay(
            user.pk,
            "Account deletion requested",
            (
                f"Your account is scheduled for deletion in {grace_days} days. "
                "Sign in and cancel if this was not you."
            ),
        )
    )
    return deletion


@transaction.atomic
def cancel_account_deletion(user: User) -> None:
    AccountDeletionRequest.objects.filter(
        user=user, status=AccountDeletionRequest.Status.SCHEDULED
    ).update(status=AccountDeletionRequest.Status.CANCELLED)
    user.deletion_requested_at = None
    user.deletion_scheduled_for = None
    user.save(update_fields=("deletion_requested_at", "deletion_scheduled_for"))


def validate_account_can_authenticate(user: User) -> None:
    if not user.is_active or user.deleted_at:
        raise ValidationError("Unable to sign in with the supplied credentials.")
    if user.suspended_at:
        raise ValidationError("This account is suspended.")
