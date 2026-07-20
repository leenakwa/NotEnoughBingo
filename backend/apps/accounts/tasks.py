from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.accounts.session_management import invalidate_session_keys


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
    url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
    requested_identity = (
        f" for username {verification.pending_username!r}" if verification.pending_username else ""
    )
    send_mail(
        "Verify your Not Enough Bingo email",
        (
            f"A Not Enough Bingo registration{requested_identity} requested this "
            "address. Only continue if you made that request.\n\n"
            f"The link expires in 24 hours:\n\n{url}"
        ),
        settings.DEFAULT_FROM_EMAIL,
        [verification.email],
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
    if not user:
        return
    url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        "Reset your Not Enough Bingo password",
        (
            f"Open this link to choose a new password:\n\n{url}\n\n"
            "If you did not request this, ignore this email."
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
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)


@shared_task(ignore_result=True)
def process_scheduled_account_deletions() -> int:
    due = AccountDeletionRequest.objects.filter(
        status=AccountDeletionRequest.Status.SCHEDULED,
        scheduled_for__lte=timezone.now(),
    ).values_list("pk", flat=True)
    processed = 0
    for request_id in due.iterator():
        with transaction.atomic():
            deletion = (
                AccountDeletionRequest.objects.select_for_update()
                .select_related("user")
                .get(pk=request_id)
            )
            if deletion.status != AccountDeletionRequest.Status.SCHEDULED:
                continue
            user = deletion.user
            now = timezone.now()
            deletion.status = AccountDeletionRequest.Status.PROCESSING
            deletion.save(update_fields=("status", "updated_at"))
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
            user.profile.avatar = None
            user.profile.save()
            SecurityEvent.objects.create(
                user=user, event_type=SecurityEvent.EventType.ACCOUNT_DELETED
            )
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
            processed += 1
    return processed


@shared_task(ignore_result=True)
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
