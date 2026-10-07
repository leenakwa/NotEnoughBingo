from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import Callable
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import HASH_SESSION_KEY, login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.backends.db import SessionStore
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import HttpRequest
from django.utils import timezone

from apps.accounts.email_tokens import VERIFICATION_SCHEME, derive_verification_token
from apps.accounts.exceptions import AccountDeletionConflict
from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.accounts.security import hash_sensitive, request_ip
from apps.accounts.session_management import (
    invalidate_credential_session_keys,
    invalidate_session_keys,
)
from apps.accounts.tasks import (
    send_account_security_notifications,
    send_password_security_notification,
    send_verification_notification,
)

logger = logging.getLogger(__name__)


def _enqueue_account_mail_after_commit(publish: Callable[[], object]) -> None:
    def enqueue() -> None:
        try:
            publish()
        except Exception as exc:
            # The delivery intent was stored with the mutation and is recoverable.
            logger.warning(
                "account.email_dispatch_failed",
                extra={"outcome": "pending", "exception_type": type(exc).__name__},
            )

    transaction.on_commit(enqueue)


def _record_password_event(user: User, event_type: str) -> None:
    event = SecurityEvent.objects.create(
        user=user,
        event_type=event_type,
        metadata={"security_email": {"status": "pending", "attempts": 0, "recipient": user.email}},
    )

    def publish_notification() -> None:
        try:
            send_password_security_notification.delay(event.pk)
        except Exception as exc:
            # The committed intent is retried by the scheduled recovery task.
            logger.warning(
                "credential.security_email_dispatch_failed",
                extra={"outcome": "pending", "exception_type": type(exc).__name__},
            )

    transaction.on_commit(publish_notification)


def _validate_new_password(password: str, user: User) -> None:
    try:
        validate_password(password, user)
    except ValidationError as exc:
        raise ValidationError({"new_password": exc.messages}) from exc


@transaction.atomic
def reset_password(
    *, user_id: str, token: str, new_password: str, request: HttpRequest | None = None
) -> None:
    try:
        user = User.objects.select_for_update().get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist) as exc:
        raise ValidationError({"token": "The reset link is invalid or expired."}) from exc
    if not default_token_generator.check_token(user, token):
        raise ValidationError({"token": "The reset link is invalid or expired."})
    _validate_new_password(new_password, user)
    user.set_password(new_password)
    user.save(update_fields=("password",))
    session_keys = list(
        user.session_metadata.filter(revoked_at__isnull=True).values_list("session_key", flat=True)
    )
    user.session_metadata.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
    invalidate_credential_session_keys(session_keys)
    _record_password_event(user, SecurityEvent.EventType.PASSWORD_RESET)
    if request is not None:
        transaction.on_commit(lambda: setattr(request, "_neb_credentials_committed", True))


def change_password(request, *, current_password: str, new_password: str) -> None:  # type: ignore[no-untyped-def]
    # Loading a cached session must happen before the SQL transaction. Keep the
    # request's original store untouched until its replacement is committed.
    original_session = request.session
    session_data = dict(original_session.items())
    old_session_key = original_session.session_key
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=request.user.pk)
        validate_account_can_authenticate(user)
        if not user.check_password(current_password):
            raise ValidationError({"current_password": "The current password is incorrect."})
        _validate_new_password(new_password, user)
        user.set_password(new_password)
        user.save(update_fields=("password",))
        replacement = SessionStore()
        replacement.update(session_data)
        replacement[HASH_SESSION_KEY] = user.get_session_auth_hash()
        replacement.save()
        now = timezone.now()
        SessionMetadata.objects.filter(user=user, session_key=old_session_key).update(
            session_key=replacement.session_key,
            last_seen_at=now,
            expires_at=replacement.get_expiry_date(),
        )
        other_sessions = user.session_metadata.filter(revoked_at__isnull=True).exclude(
            session_key=replacement.session_key
        )
        other_session_keys = list(other_sessions.values_list("session_key", flat=True))
        other_sessions.update(revoked_at=now)

        def install_session() -> None:
            replacement.modified = False
            django_request = getattr(request, "_request", request)
            django_request.session = replacement
            django_request._neb_password_session_rotated = True
            django_request._neb_credentials_committed = True
            request.user = user

        transaction.on_commit(install_session)
        invalidate_credential_session_keys((*other_session_keys, old_session_key))
        _record_password_event(user, SecurityEvent.EventType.PASSWORD_CHANGED)


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
    verification = EmailVerification(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.VERIFY_EMAIL,
        expires_at=now + timedelta(seconds=settings.EMAIL_VERIFICATION_TTL_SECONDS),
        pending_username=pending_username,
        pending_display_name=pending_display_name,
        pending_password_hash=pending_password_hash,
        delivery={"status": "pending", "attempts": 0, "token_scheme": VERIFICATION_SCHEME},
    )
    token = derive_verification_token(verification)
    verification.token_hash = token_digest(token)
    verification.save()
    _enqueue_account_mail_after_commit(
        lambda: send_verification_notification.delay(verification.pk)
    )
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


@transaction.atomic
def request_email_change(*, user: User, new_email: str, current_password: str) -> None:
    now = timezone.now()
    user = User.objects.select_for_update().get(pk=user.pk)
    if not check_password(current_password, user.password):
        raise ValidationError({"current_password": "The current password is incorrect."})
    if not user.can_create_content:
        raise ValidationError("This account cannot change its email address right now.")
    if new_email == user.email.lower():
        raise ValidationError("Enter a different email address.")
    if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        raise ValidationError("This email address is unavailable.")
    EmailVerification.objects.filter(
        user=user,
        purpose=EmailVerification.Purpose.CHANGE_EMAIL,
        used_at__isnull=True,
    ).update(used_at=now)
    verification = EmailVerification(
        user=user,
        email=new_email,
        purpose=EmailVerification.Purpose.CHANGE_EMAIL,
        expires_at=now + timedelta(seconds=settings.EMAIL_VERIFICATION_TTL_SECONDS),
        delivery={"status": "pending", "attempts": 0, "token_scheme": VERIFICATION_SCHEME},
    )
    verification.token_hash = token_digest(derive_verification_token(verification))
    verification.save()
    _enqueue_account_mail_after_commit(
        lambda: send_verification_notification.delay(verification.pk)
    )


def confirm_email_change(token: str) -> User:
    now = timezone.now()
    with transaction.atomic():
        verification = (
            EmailVerification.objects.select_related("user")
            .filter(
                token_hash=token_digest(token),
                purpose=EmailVerification.Purpose.CHANGE_EMAIL,
                used_at__isnull=True,
            )
            .first()
        )
        if verification is None:
            raise ValidationError("The email change link is invalid or has already been used.")
        user = User.objects.select_for_update().get(pk=verification.user_id)
        verification = EmailVerification.objects.select_for_update().get(pk=verification.pk)
        if verification.used_at is not None or verification.expires_at <= now:
            raise ValidationError("The email change link is invalid or expired.")
        if not user.can_create_content:
            raise ValidationError("This account cannot change its email address right now.")
        if User.objects.filter(email__iexact=verification.email).exclude(pk=user.pk).exists():
            raise ValidationError("This email address is unavailable. Request a new link.")
        old_email = user.email
        user.email = verification.email
        user.email_verified_at = now
        try:
            with transaction.atomic():
                user.save(update_fields=("email", "email_verified_at"))
        except IntegrityError as exc:
            raise ValidationError("This email address is unavailable. Request a new link.") from exc
        EmailVerification.objects.filter(
            user=user,
            purpose=EmailVerification.Purpose.CHANGE_EMAIL,
            used_at__isnull=True,
        ).update(used_at=now)
        event = SecurityEvent.objects.create(
            user=user,
            event_type=SecurityEvent.EventType.EMAIL_CHANGED,
            metadata={
                "security_email": {"status": "pending", "attempts": 0, "recipient": user.email},
                "previous_email_notice": {
                    "status": "pending",
                    "attempts": 0,
                    "recipient": old_email,
                },
            },
        )
        _enqueue_account_mail_after_commit(
            lambda: send_account_security_notifications.delay(event.pk)
        )
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
def schedule_account_deletion(user: User, *, password: str) -> AccountDeletionRequest:
    now = timezone.now()
    user = User.objects.select_for_update().get(pk=user.pk)
    if not check_password(password, user.password):
        raise ValidationError({"password": "The password is incorrect."})
    existing = AccountDeletionRequest.objects.filter(
        user=user, status=AccountDeletionRequest.Status.SCHEDULED
    ).first()
    if existing:
        return existing
    grace_days = settings.ACCOUNT_DELETION_GRACE_DAYS
    scheduled_for = now + timedelta(days=grace_days)
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
    event = SecurityEvent.objects.create(
        user=user,
        event_type=SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED,
        metadata={
            "security_email": {
                "status": "pending",
                "attempts": 0,
                "recipient": user.email,
                "deletion_request_id": deletion.pk,
                "scheduled_for": scheduled_for.isoformat(),
            }
        },
    )
    _enqueue_account_mail_after_commit(lambda: send_account_security_notifications.delay(event.pk))
    return deletion


@transaction.atomic
def cancel_account_deletion(user: User) -> None:
    deletion = (
        AccountDeletionRequest.objects.select_for_update()
        .select_related("user")
        .filter(user_id=user.pk)
        .order_by("-created_at", "-pk")
        .first()
    )
    if deletion is None:
        raise AccountDeletionConflict("No scheduled account deletion is available to cancel.")
    if deletion.status == AccountDeletionRequest.Status.PROCESSING:
        raise AccountDeletionConflict(
            "Account deletion is already being processed and can no longer be cancelled."
        )
    if deletion.status == AccountDeletionRequest.Status.COMPLETE:
        raise AccountDeletionConflict(
            "Account deletion is complete and can no longer be cancelled."
        )
    if deletion.status != AccountDeletionRequest.Status.SCHEDULED:
        raise AccountDeletionConflict()

    deletion.status = AccountDeletionRequest.Status.CANCELLED
    deletion.save(update_fields=("status", "updated_at"))
    locked_user = deletion.user
    locked_user.deletion_requested_at = None
    locked_user.deletion_scheduled_for = None
    locked_user.save(update_fields=("deletion_requested_at", "deletion_scheduled_for"))
    # Match deletion completion's request/user -> event lock order. A sender
    # holding this event finishes before cancellation can commit; later sends
    # see cancelled intent and cannot emit an obsolete deletion warning.
    events = SecurityEvent.objects.select_for_update().filter(
        user=locked_user,
        event_type=SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED,
        metadata__security_email__deletion_request_id=deletion.pk,
    )
    for event in events:
        intent = dict(event.metadata["security_email"])
        if intent.get("status") == "pending":
            event.metadata = {**event.metadata, "security_email": {**intent, "status": "cancelled"}}
            event.save(update_fields=("metadata", "updated_at"))


def validate_account_can_authenticate(user: User) -> None:
    if not user.is_active or user.deleted_at:
        raise ValidationError("Unable to sign in with the supplied credentials.")
    if user.suspended_at:
        raise ValidationError("This account is suspended.")
