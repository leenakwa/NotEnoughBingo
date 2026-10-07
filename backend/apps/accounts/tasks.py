from __future__ import annotations

import hashlib
import logging
from datetime import UTC, timedelta

from celery import shared_task
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.models import Session
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.utils.dateparse import parse_datetime

from apps.accounts.email_tokens import recover_verification_token
from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.accounts.session_management import invalidate_session_keys
from apps.common.jobs import periodic_task

logger = logging.getLogger(__name__)


@shared_task(
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    ignore_result=True,
)
def send_verification_email(verification_id: int, raw_token: str) -> None:
    verification = (
        EmailVerification.objects.select_related("user").filter(pk=verification_id).first()
    )
    if not verification or verification.used_at or verification.expires_at <= timezone.now():
        return
    if not constant_time_compare(
        hashlib.sha256(raw_token.encode()).hexdigest(), verification.token_hash
    ):
        return
    _send_verification_mail(verification, raw_token)


def _send_verification_mail(verification: EmailVerification, raw_token: str) -> None:
    changing_email = verification.purpose == EmailVerification.Purpose.CHANGE_EMAIL
    route = "confirm-email-change" if changing_email else "verify-email"
    url = f"{settings.FRONTEND_URL}/{route}?token={raw_token}"
    requested_identity = (
        f" for username {verification.pending_username!r}" if verification.pending_username else ""
    )
    subject = (
        "Confirm your new Not Enough Bingo email"
        if changing_email
        else "Verify your Not Enough Bingo email"
    )
    body = (
        "A change to your Not Enough Bingo email address was requested. "
        "Only continue if you made that request.\n\n"
        if changing_email
        else f"A Not Enough Bingo registration{requested_identity} requested this address. "
        "Only continue if you made that request.\n\n"
    )
    expires_at = verification.expires_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    sent = send_mail(
        subject,
        body
        + f"This link expires at {expires_at}:\n\n{url}\n\n"
        + f"Support: {settings.FRONTEND_URL}/support",
        settings.DEFAULT_FROM_EMAIL,
        [verification.email],
        fail_silently=False,
    )
    if sent != 1:
        raise OSError("Verification email was not accepted by the mail transport.")


def _delivery_failure(intent: dict, error_code: str) -> dict:
    attempts = int(intent.get("attempts", 0)) + 1
    delay = min(60 * 2 ** min(attempts, 6), 3600)
    return {
        **intent,
        "attempts": attempts,
        "last_error_code": error_code,
        "next_attempt_at": (timezone.now() + timedelta(seconds=delay)).isoformat(),
    }


def _deliver_verification_notification(verification_id: int) -> bool:
    with transaction.atomic():
        verification = (
            EmailVerification.objects.select_for_update(skip_locked=True)
            .filter(pk=verification_id, delivery__status="pending")
            .first()
        )
        if verification is None:
            return False
        now = timezone.now()
        intent = dict(verification.delivery)
        if intent.get("next_attempt_at", "") > now.isoformat():
            return False
        # These reads do not lock User while the verification row is held.
        # Issuers/confirmers serialize invalidation on this verification row.
        user = User.objects.filter(pk=verification.user_id).first()
        usable = bool(user and not user.deleted_at and not user.suspended_at)
        if user and verification.purpose == EmailVerification.Purpose.VERIFY_EMAIL:
            usable = usable and user.email == verification.email and user.email_verified_at is None
        elif user and verification.purpose == EmailVerification.Purpose.CHANGE_EMAIL:
            usable = usable and user.can_create_content
        else:
            usable = False
        if verification.used_at or verification.expires_at <= now or not usable:
            verification.delivery = {**intent, "status": "cancelled"}
            verification.save(update_fields=("delivery", "updated_at"))
            return False
        token = recover_verification_token(verification)
        if token is None:
            # A missing rotation key or legacy digest cannot be reconstructed.
            # Preserve the original link and report a deferred delivery.
            verification.delivery = _delivery_failure(intent, "token_key_unavailable")
            verification.save(update_fields=("delivery", "updated_at"))
            logger.warning("account.verification_delivery_deferred", extra={"outcome": "pending"})
            return False
        _send_verification_mail(verification, token)
        verification.delivery = {**intent, "status": "sent", "sent_at": now.isoformat()}
        verification.save(update_fields=("delivery", "updated_at"))
        return True


@shared_task(ignore_result=True)
def send_verification_notification(verification_id: int) -> bool:
    try:
        return _deliver_verification_notification(verification_id)
    except OSError as exc:
        with transaction.atomic():
            verification = (
                EmailVerification.objects.select_for_update(skip_locked=True)
                .filter(pk=verification_id, delivery__status="pending")
                .first()
            )
            if verification is not None:
                verification.delivery = _delivery_failure(
                    dict(verification.delivery), "mail_transport_failed"
                )
                verification.save(update_fields=("delivery", "updated_at"))
        logger.warning(
            "account.verification_delivery_failed",
            extra={"outcome": "pending", "exception_type": type(exc).__name__},
        )
        return False


@shared_task(
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    ignore_result=True,
)
def send_email_change_notice(old_email: str) -> None:
    send_mail(
        "Your Not Enough Bingo email address changed",
        "The email address on your Not Enough Bingo account changed. "
        "Contact support immediately if this was not you.\n\n"
        f"Support: {settings.FRONTEND_URL}/support",
        settings.DEFAULT_FROM_EMAIL,
        [old_email],
        fail_silently=False,
    )


@shared_task(
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    ignore_result=True,
)
def send_password_reset_email(user_id: int, uid: str, token: str) -> None:
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if not user or not default_token_generator.check_token(user, token):
        return
    url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        "Reset your Not Enough Bingo password",
        (
            f"Open this link to choose a new password:\n\n{url}\n\n"
            "If you did not request this, ignore this email.\n\n"
            f"Support: {settings.FRONTEND_URL}/support"
        ),
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


@shared_task(
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    ignore_result=True,
)
def send_critical_security_email(user_id: int, subject: str, body: str) -> None:
    email = User.objects.filter(pk=user_id).values_list("email", flat=True).first()
    if email:
        send_mail(
            subject,
            f"{body}\n\nSupport: {settings.FRONTEND_URL}/support",
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )


PASSWORD_SECURITY_MESSAGES = {
    SecurityEvent.EventType.PASSWORD_RESET: (
        "Your password was reset",
        "Your Not Enough Bingo password was reset. "
        "Contact support immediately if this was not you.",
    ),
    SecurityEvent.EventType.PASSWORD_CHANGED: (
        "Your password changed",
        "Your Not Enough Bingo password changed. Reset it immediately if this was not you.",
    ),
}

ACCOUNT_SECURITY_MESSAGES = {
    **PASSWORD_SECURITY_MESSAGES,
    SecurityEvent.EventType.EMAIL_CHANGED: (
        "Your email address changed",
        "Your Not Enough Bingo email address changed. "
        "Contact support immediately if this was not you.",
    ),
    SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED: ("Account deletion requested", ""),
}


def _security_notification_message(event: SecurityEvent, intent_key: str, intent: dict):
    if intent_key == "previous_email_notice":
        if event.event_type != SecurityEvent.EventType.EMAIL_CHANGED:
            return None
        return (
            "Your Not Enough Bingo email address changed",
            "The email address on your Not Enough Bingo account changed. "
            "Contact support immediately if this was not you.",
        )
    if event.event_type == SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED:
        # No request/user lock is acquired while holding the event row. Cancellation
        # updates this same event before its transaction commits; completion scrubs it.
        deadline = parse_datetime(intent.get("scheduled_for", ""))
        if (
            not deadline
            or not AccountDeletionRequest.objects.filter(
                pk=intent.get("deletion_request_id"),
                user_id=event.user_id,
                status=AccountDeletionRequest.Status.SCHEDULED,
                scheduled_for=deadline,
            ).exists()
        ):
            return None
        deadline_label = deadline.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
        return (
            "Account deletion requested",
            f"Your account is scheduled for deletion at {deadline_label}. "
            "Sign in and cancel if this was not you.",
        )
    return ACCOUNT_SECURITY_MESSAGES.get(event.event_type)


def _deliver_security_notification(event_id: int, intent_key: str = "security_email") -> bool:
    """Serialize normal delivery; a crash after SMTP acceptance may send twice."""
    with transaction.atomic():
        event = (
            SecurityEvent.objects.select_for_update(skip_locked=True)
            .filter(
                pk=event_id,
                event_type__in=ACCOUNT_SECURITY_MESSAGES,
                **{f"metadata__{intent_key}__status": "pending"},
            )
            .first()
        )
        if event is None:
            return False
        intent = dict(event.metadata[intent_key])
        now = timezone.now()
        if intent.get("next_attempt_at", "") > now.isoformat():
            return False
        email = intent.get("recipient")
        message = _security_notification_message(event, intent_key, intent)
        if not email or message is None:
            intent["status"] = "cancelled"
        else:
            subject, body = message
            sent = send_mail(
                subject,
                f"{body}\n\nSupport: {settings.FRONTEND_URL}/support",
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            if sent != 1:
                raise OSError("Security notification was not accepted by the mail transport.")
            intent.update(status="sent", sent_at=now.isoformat())
        event.metadata = {**event.metadata, intent_key: intent}
        event.save(update_fields=("metadata", "updated_at"))
        return intent["status"] == "sent"


def _attempt_security_notification(event_id: int, intent_key: str) -> bool:
    try:
        return _deliver_security_notification(event_id, intent_key)
    except OSError as exc:
        with transaction.atomic():
            event = (
                SecurityEvent.objects.select_for_update(skip_locked=True)
                .filter(pk=event_id, **{f"metadata__{intent_key}__status": "pending"})
                .first()
            )
            if event is not None:
                intent = _delivery_failure(
                    dict(event.metadata[intent_key]), "mail_transport_failed"
                )
                event.metadata = {**event.metadata, intent_key: intent}
                event.save(update_fields=("metadata", "updated_at"))
        logger.warning(
            "credential.security_email_delivery_failed",
            extra={"outcome": "pending", "exception_type": type(exc).__name__},
        )
        return False


@shared_task(ignore_result=True)
def send_password_security_notification(event_id: int) -> bool:
    return _attempt_security_notification(event_id, "security_email")


@shared_task(ignore_result=True)
def send_account_security_notifications(event_id: int) -> int:
    delivered = 0
    for intent_key in ("security_email", "previous_email_notice"):
        try:
            delivered += int(_attempt_security_notification(event_id, intent_key))
        except Exception as exc:
            # Each recipient has its own commit and retry state. An unavailable
            # recipient or failed acknowledgement must not suppress the other notice.
            logger.warning(
                "account.security_email_delivery_failed",
                extra={"outcome": "pending", "exception_type": type(exc).__name__},
            )
    return delivered


@periodic_task
def recover_account_email_notifications() -> int:
    now = timezone.now().isoformat()
    verifications = (
        EmailVerification.objects.filter(delivery__status="pending")
        .filter(Q(delivery__next_attempt_at__isnull=True) | Q(delivery__next_attempt_at__lte=now))
        .order_by("created_at", "pk")
        .values_list("pk", flat=True)[:10]
    )
    due_notices = Q()
    for intent_key in ("security_email", "previous_email_notice"):
        due_notices |= Q(**{f"metadata__{intent_key}__status": "pending"}) & (
            Q(**{f"metadata__{intent_key}__next_attempt_at__isnull": True})
            | Q(**{f"metadata__{intent_key}__next_attempt_at__lte": now})
        )
    events = (
        SecurityEvent.objects.filter(
            event_type__in=(
                SecurityEvent.EventType.EMAIL_CHANGED,
                SecurityEvent.EventType.ACCOUNT_DELETION_REQUESTED,
            )
        )
        .filter(due_notices)
        .order_by("created_at", "pk")
        .values_list("pk", flat=True)[:10]
    )
    delivered = 0
    # At most ten verification rows and ten events (two notices each) per sweep.
    for ids, sender in (
        (list(verifications), send_verification_notification),
        (list(events), send_account_security_notifications),
    ):
        for record_id in ids:
            try:
                delivered += int(sender.run(record_id))
            except Exception as exc:
                logger.warning(
                    "account.email_recovery_failed",
                    extra={"outcome": "pending", "exception_type": type(exc).__name__},
                )
    return delivered


@periodic_task
def recover_password_security_notifications() -> int:
    # A sweep cannot exceed 25 transport attempts, each bounded by EMAIL_TIMEOUT.
    pending = (
        SecurityEvent.objects.filter(
            event_type__in=PASSWORD_SECURITY_MESSAGES,
            metadata__security_email__status="pending",
        )
        .filter(
            Q(metadata__security_email__next_attempt_at__isnull=True)
            | Q(metadata__security_email__next_attempt_at__lte=timezone.now().isoformat())
        )
        .order_by("created_at", "pk")
        .values_list("pk", flat=True)[:25]
    )
    delivered = 0
    for event_id in list(pending):
        try:
            delivered += int(send_password_security_notification.run(event_id))
        except Exception as exc:
            logger.warning(
                "credential.security_email_recovery_failed",
                extra={"outcome": "pending", "exception_type": type(exc).__name__},
            )
    return delivered


def _process_account_deletion_request(request_id: int) -> bool:
    with transaction.atomic():
        deletion = (
            AccountDeletionRequest.objects.select_for_update()
            .select_related("user")
            .filter(pk=request_id)
            .first()
        )
        if not deletion or deletion.status != AccountDeletionRequest.Status.SCHEDULED:
            return False
        user = deletion.user
        now = timezone.now()
        deletion.status = AccountDeletionRequest.Status.PROCESSING
        deletion.error_code = ""
        deletion.save(update_fields=("status", "error_code", "updated_at"))
        from apps.bingos.models import Bingo, Draft

        Bingo.objects.filter(author=user, deleted_at__isnull=True).update(
            status=Bingo.Status.ARCHIVED,
            visibility=Bingo.Visibility.PRIVATE,
            archived_at=now,
            deleted_at=now,
            updated_at=now,
        )
        Draft.objects.filter(bingo__author=user).delete()
        from apps.accounts.models import Follow
        from apps.analytics.models import InteractionEvent
        from apps.exports.models import ExportJob
        from apps.media_assets.models import MediaAsset
        from apps.media_assets.services import delete_unreferenced_asset
        from apps.moderation.models import Report
        from apps.notifications.models import Notification
        from apps.plays.models import PlayProgress, SharedResult
        from apps.social.models import BingoLike, Comment, CommentLike

        Follow.objects.filter(Q(follower=user) | Q(following=user)).delete()
        Notification.objects.filter(Q(recipient=user) | Q(actor=user)).delete()
        InteractionEvent.objects.filter(actor=user).update(actor=None)
        PlayProgress.objects.filter(user=user).delete()
        SharedResult.objects.filter(owner=user).update(owner_display_name="Deleted user")
        liked_bingo_ids = list(
            BingoLike.objects.filter(user=user).values_list("bingo_id", flat=True)
        )
        BingoLike.objects.filter(user=user).delete()
        for bingo_id in liked_bingo_ids:
            Bingo.objects.filter(pk=bingo_id).update(
                like_count=BingoLike.objects.filter(bingo_id=bingo_id).count()
            )
        liked_comment_ids = list(
            CommentLike.objects.filter(user=user).values_list("comment_id", flat=True)
        )
        CommentLike.objects.filter(user=user).delete()
        for comment_id in liked_comment_ids:
            Comment.objects.filter(pk=comment_id).update(
                like_count=CommentLike.objects.filter(comment_id=comment_id).count()
            )
        user.session_metadata.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
        active_session_keys = list(user.session_metadata.values_list("session_key", flat=True))
        invalidate_session_keys(active_session_keys)
        SessionMetadata.objects.filter(user=user).delete()
        EmailVerification.objects.filter(user=user).delete()
        Report.objects.filter(reporter=user).update(
            description="",
            context_snapshot={},
        )
        Report.objects.filter(
            Q(profile__user=user) | Q(bingo__author=user) | Q(comment__author=user)
        ).update(context_snapshot={})
        ExportJob.objects.filter(owner=user).delete()
        user.email = f"deleted-{user.public_id}@deleted.invalid"
        user.username = f"deleted-{str(user.public_id).replace('-', '')[:20]}"
        user.first_name = ""
        user.last_name = ""
        user.set_unusable_password()
        user.is_active = False
        user.email_verified_at = None
        user.deleted_at = now
        user.deletion_requested_at = None
        user.deletion_scheduled_for = None
        user.suspension_reason = ""
        user.save()
        user.profile.display_name = "Deleted user"
        user.profile.bio = ""
        user.profile.preferred_languages = []
        user.profile.language_preferences_confirmed = False
        user.profile.avatar = None
        user.profile.save()
        SecurityEvent.objects.create(user=user, event_type=SecurityEvent.EventType.ACCOUNT_DELETED)
        SecurityEvent.objects.filter(user=user).update(
            user=None,
            ip_hash="",
            user_agent="",
            metadata={},
        )
        MediaAsset.objects.filter(owner=user).update(original_filename="")
        for asset in MediaAsset.objects.filter(owner=user, deleted_at__isnull=True):
            delete_unreferenced_asset(asset=asset, owner=user)
        deletion.status = AccountDeletionRequest.Status.COMPLETE
        deletion.completed_at = timezone.now()
        deletion.save(update_fields=("status", "completed_at", "updated_at"))
        return True


@periodic_task
def process_scheduled_account_deletions() -> int:
    due = AccountDeletionRequest.objects.filter(
        status=AccountDeletionRequest.Status.SCHEDULED,
        scheduled_for__lte=timezone.now(),
    ).values_list("pk", flat=True)
    processed = 0
    for request_id in due.iterator():
        try:
            processed += int(_process_account_deletion_request(request_id))
        except Exception as exc:
            AccountDeletionRequest.objects.filter(
                pk=request_id,
                status=AccountDeletionRequest.Status.SCHEDULED,
            ).update(
                status=AccountDeletionRequest.Status.FAILED,
                error_code="processing_failed",
                updated_at=timezone.now(),
            )
            logger.exception(
                "account_deletion.processing_failed",
                extra={
                    "task_name": "apps.accounts.tasks.process_scheduled_account_deletions",
                    "outcome": "failed",
                    "exception_type": type(exc).__name__,
                },
            )
    return processed


@periodic_task
def cleanup_expired_auth_records() -> dict[str, int]:
    now = timezone.now()
    Session.objects.clear_expired()
    metadata_deleted, _ = SessionMetadata.objects.filter(
        expires_at__lte=now,
    ).delete()
    verification_deleted, _ = EmailVerification.objects.filter(
        expires_at__lt=now - timedelta(days=30),
    ).delete()
    return {
        "session_metadata": metadata_deleted,
        "email_verifications": verification_deleted,
    }
