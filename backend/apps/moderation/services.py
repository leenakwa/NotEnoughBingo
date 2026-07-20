from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.session_management import invalidate_session_keys
from apps.accounts.tasks import send_critical_security_email
from apps.moderation.models import ModerationAction, Report, ReportStatusHistory


def target_public_id(report: Report) -> str:
    if report.target_type == Report.TargetType.BINGO and report.bingo:
        return str(report.bingo.public_id)
    if report.target_type == Report.TargetType.COMMENT and report.comment:
        return str(report.comment.public_id)
    if report.target_type == Report.TargetType.PROFILE and report.profile:
        return str(report.profile.public_id)
    raise ValueError("Report target is inconsistent.")


@transaction.atomic
def create_report(
    *,
    reporter: User,
    target_type: str,
    target: Any,
    reason: str,
    description: str,
) -> Report:
    relation = {target_type: target}
    existing = Report.objects.filter(
        reporter=reporter,
        target_type=target_type,
        status__in=(Report.Status.OPEN, Report.Status.IN_REVIEW),
        **relation,
    ).first()
    if existing:
        return existing
    if target_type == Report.TargetType.BINGO:
        snapshot = {
            "public_id": str(target.public_id),
            "title": target.title,
            "author": target.author.username if target.author_id else None,
            "visibility": target.visibility,
        }
    elif target_type == Report.TargetType.COMMENT:
        snapshot = {
            "public_id": str(target.public_id),
            "body": target.display_body[:500],
            "author": target.author.username,
            "bingo_id": str(target.bingo.public_id),
        }
    else:
        snapshot = {
            "public_id": str(target.public_id),
            "username": target.user.username,
            "display_name": target.display_name,
            "bio": target.bio[:500],
        }
    try:
        with transaction.atomic():
            report = Report.objects.create(
                reporter=reporter,
                target_type=target_type,
                reason=reason,
                description=description,
                context_snapshot=snapshot,
                **relation,
            )
    except IntegrityError:
        return Report.objects.get(
            reporter=reporter,
            target_type=target_type,
            status__in=(Report.Status.OPEN, Report.Status.IN_REVIEW),
            **relation,
        )
    ReportStatusHistory.objects.create(
        report=report, from_status="", to_status=Report.Status.OPEN, changed_by=reporter
    )
    return report


@transaction.atomic
def apply_moderation_action(
    *,
    report: Report,
    moderator: User,
    action: str,
    reason: str,
) -> ModerationAction:
    if (
        not moderator.is_active
        or not moderator.email_verified_at
        or moderator.suspended_at
        or moderator.deletion_requested_at
        or moderator.deleted_at
        or not moderator.has_perm("moderation.moderate_content")
        or not moderator.has_perm("moderation.view_private_content")
    ):
        raise ValidationError({"moderator": "Moderator privileges are required."})
    locked = Report.objects.select_for_update().get(pk=report.pk)
    now = timezone.now()
    bingo = locked.bingo
    comment = locked.comment
    profile = locked.profile

    if action == ModerationAction.Action.HIDE:
        if locked.target_type == Report.TargetType.PROFILE:
            raise ValidationError({"action": "Profiles are suspended rather than hidden."})
        content = bingo if locked.target_type == Report.TargetType.BINGO else comment
        if content is None:
            raise ValidationError({"target": "The reported content is unavailable."})
        content.hidden_at = now
        content.hidden_reason = reason
        content.save(update_fields=("hidden_at", "hidden_reason", "updated_at"))
        next_status = Report.Status.RESOLVED
    elif action == ModerationAction.Action.RESTORE:
        if locked.target_type == Report.TargetType.PROFILE:
            raise ValidationError({"action": "Use unsuspend for a profile."})
        content = bingo if locked.target_type == Report.TargetType.BINGO else comment
        if content is None:
            raise ValidationError({"target": "The reported content is unavailable."})
        content.hidden_at = None
        content.hidden_reason = ""
        content.save(update_fields=("hidden_at", "hidden_reason", "updated_at"))
        next_status = Report.Status.RESOLVED
    elif action == ModerationAction.Action.SOFT_DELETE:
        if locked.target_type == Report.TargetType.PROFILE:
            raise ValidationError({"action": "Use suspend for a profile."})
        if locked.target_type == Report.TargetType.COMMENT:
            if comment is None:
                raise ValidationError({"target": "The reported comment is unavailable."})
            comment.deleted_at = now
            comment.body = ""
            comment.save(update_fields=("deleted_at", "body", "updated_at"))
        else:
            from apps.bingos.models import Bingo

            if bingo is None:
                raise ValidationError({"target": "The reported bingo is unavailable."})
            bingo.deleted_at = now
            bingo.status = Bingo.Status.ARCHIVED
            bingo.save(update_fields=("deleted_at", "status", "updated_at"))
        next_status = Report.Status.RESOLVED
    elif action == ModerationAction.Action.SUSPEND_USER:
        if locked.target_type == Report.TargetType.PROFILE:
            if profile is None:
                raise ValidationError({"target": "The reported profile is unavailable."})
            user = profile.user
        elif locked.target_type == Report.TargetType.COMMENT:
            if comment is None:
                raise ValidationError({"target": "The reported comment is unavailable."})
            user = comment.author
        else:
            if bingo is None:
                raise ValidationError({"target": "The reported bingo is unavailable."})
            user = bingo.author
        user.suspended_at = now
        user.suspension_reason = reason
        user.save(update_fields=("suspended_at", "suspension_reason"))
        active_session_keys = list(
            user.session_metadata.filter(revoked_at__isnull=True).values_list(
                "session_key",
                flat=True,
            )
        )
        user.session_metadata.filter(revoked_at__isnull=True).update(revoked_at=now)
        invalidate_session_keys(active_session_keys)
        transaction.on_commit(
            lambda: send_critical_security_email.delay(
                user.pk,
                "Your Not Enough Bingo account was suspended",
                "Your account was suspended. Contact support if you believe this is an error.",
            )
        )
        next_status = Report.Status.RESOLVED
    elif action == ModerationAction.Action.UNSUSPEND_USER:
        if locked.target_type == Report.TargetType.PROFILE:
            if profile is None:
                raise ValidationError({"target": "The reported profile is unavailable."})
            user = profile.user
        elif locked.target_type == Report.TargetType.COMMENT:
            if comment is None:
                raise ValidationError({"target": "The reported comment is unavailable."})
            user = comment.author
        else:
            if bingo is None:
                raise ValidationError({"target": "The reported bingo is unavailable."})
            user = bingo.author
        user.suspended_at = None
        user.suspension_reason = ""
        user.save(update_fields=("suspended_at", "suspension_reason"))
        transaction.on_commit(
            lambda: send_critical_security_email.delay(
                user.pk,
                "Your Not Enough Bingo account was restored",
                "Your account suspension was removed.",
            )
        )
        next_status = Report.Status.RESOLVED
    elif action == ModerationAction.Action.DISMISS:
        next_status = Report.Status.DISMISSED
    elif action == ModerationAction.Action.RESOLVE_NO_ACTION:
        next_status = Report.Status.RESOLVED
    else:
        raise ValidationError({"action": "Unsupported moderation action."})

    audit = ModerationAction.objects.create(
        report=locked,
        moderator=moderator,
        action=action,
        target_type=locked.target_type,
        target_public_id=target_public_id(locked),
        reason=reason,
    )
    previous_status = locked.status
    locked.status = next_status
    locked.assigned_moderator = moderator
    locked.decision = reason
    locked.resolved_at = now
    locked.save(
        update_fields=(
            "status",
            "assigned_moderator",
            "decision",
            "resolved_at",
            "updated_at",
        )
    )
    ReportStatusHistory.objects.create(
        report=locked,
        from_status=previous_status,
        to_status=next_status,
        changed_by=moderator,
        note=reason,
    )
    return audit
