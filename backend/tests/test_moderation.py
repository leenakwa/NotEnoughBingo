from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.contrib.sessions.backends.db import SessionStore
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import SessionMetadata, User
from apps.moderation.models import ModerationAction, Report, ReportStatusHistory
from apps.moderation.services import apply_moderation_action, create_report
from apps.moderation.views import ModerationReportListView

pytestmark = pytest.mark.django_db


def grant_moderator(user) -> None:
    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=("email_verified_at",))
    user.user_permissions.add(
        Permission.objects.get(codename="moderate_content"),
        Permission.objects.get(codename="view_private_content"),
    )


def test_report_creation_is_idempotent_while_active_and_snapshots_context(
    user_factory,
    bingo_factory,
) -> None:
    reporter = user_factory()
    author = user_factory(username="reported_author")
    bingo = bingo_factory(author=author, title="Reported board")

    first = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo,
        reason=Report.Reason.SPAM,
        description="Repeated promotional links",
    )
    second = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo,
        reason=Report.Reason.OTHER,
        description="A duplicate active report",
    )

    assert second.pk == first.pk
    assert first.context_snapshot == {
        "public_id": str(bingo.public_id),
        "title": "Reported board",
        "author": "reported_author",
        "visibility": bingo.visibility,
    }
    assert list(first.status_history.values_list("from_status", "to_status")) == [
        ("", Report.Status.OPEN)
    ]


def test_database_rejects_report_with_mismatched_target(user_factory, bingo_factory) -> None:
    reporter = user_factory()
    bingo = bingo_factory()

    with pytest.raises(IntegrityError), transaction.atomic():
        Report.objects.create(
            reporter=reporter,
            target_type=Report.TargetType.PROFILE,
            bingo=bingo,
            reason=Report.Reason.OTHER,
        )


def test_non_moderator_cannot_apply_action(user_factory, bingo_factory) -> None:
    reporter = user_factory()
    ordinary_user = user_factory()
    report = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo_factory(),
        reason=Report.Reason.SPAM,
        description="",
    )

    with pytest.raises(ValidationError, match="Moderator privileges"):
        apply_moderation_action(
            report=report,
            moderator=ordinary_user,
            action=ModerationAction.Action.HIDE,
            reason="Confirmed spam",
        )

    report.refresh_from_db()
    assert report.status == Report.Status.OPEN
    assert not report.actions.exists()


def test_hide_and_restore_actions_mutate_content_and_append_audit_log(
    user_factory,
    bingo_factory,
) -> None:
    reporter = user_factory()
    moderator = user_factory(is_staff=True)
    grant_moderator(moderator)
    bingo = bingo_factory()
    hide_report = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo,
        reason=Report.Reason.SPAM,
        description="",
    )

    hide_audit = apply_moderation_action(
        report=hide_report,
        moderator=moderator,
        action=ModerationAction.Action.HIDE,
        reason="Confirmed spam",
    )

    bingo.refresh_from_db()
    hide_report.refresh_from_db()
    assert bingo.hidden_at is not None
    assert bingo.hidden_reason == "Confirmed spam"
    assert hide_report.status == Report.Status.RESOLVED
    assert hide_report.assigned_moderator == moderator
    assert hide_audit.target_public_id == str(bingo.public_id)
    assert list(hide_report.status_history.values_list("to_status", flat=True)) == [
        Report.Status.OPEN,
        Report.Status.RESOLVED,
    ]

    restore_report = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo,
        reason=Report.Reason.OTHER,
        description="Request restoration",
    )
    apply_moderation_action(
        report=restore_report,
        moderator=moderator,
        action=ModerationAction.Action.RESTORE,
        reason="Appeal accepted",
    )
    bingo.refresh_from_db()
    assert bingo.hidden_at is None
    assert bingo.hidden_reason == ""


def test_suspend_profile_revokes_active_sessions(user_factory) -> None:
    reporter = user_factory()
    moderator = user_factory(is_staff=True)
    grant_moderator(moderator)
    target = user_factory()
    store = SessionStore()
    store["_auth_user_id"] = str(target.pk)
    store.save()
    metadata = SessionMetadata.objects.create(
        user=target,
        session_key=store.session_key,
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )
    report = create_report(
        reporter=reporter,
        target_type=Report.TargetType.PROFILE,
        target=target.profile,
        reason=Report.Reason.HARASSMENT,
        description="",
    )

    apply_moderation_action(
        report=report,
        moderator=moderator,
        action=ModerationAction.Action.SUSPEND_USER,
        reason="Repeated harassment",
    )

    target.refresh_from_db()
    metadata.refresh_from_db()
    assert target.suspended_at is not None
    assert target.suspension_reason == "Repeated harassment"
    assert metadata.revoked_at is not None
    assert not SessionStore().exists(store.session_key)


def test_moderation_history_and_actions_are_append_only(user_factory, bingo_factory) -> None:
    reporter = user_factory()
    moderator = user_factory(is_staff=True)
    grant_moderator(moderator)
    report = create_report(
        reporter=reporter,
        target_type=Report.TargetType.BINGO,
        target=bingo_factory(),
        reason=Report.Reason.OTHER,
        description="",
    )
    action = apply_moderation_action(
        report=report,
        moderator=moderator,
        action=ModerationAction.Action.RESOLVE_NO_ACTION,
        reason="No policy violation",
    )
    history = ReportStatusHistory.objects.filter(report=report).latest("created_at")

    action.reason = "Rewritten reason"
    with pytest.raises(ValueError, match="append-only"):
        action.save()

    history.note = "Rewritten note"
    with pytest.raises(ValueError, match="append-only"):
        history.save()


def test_moderation_queue_requires_explicit_moderator_permission(user_factory) -> None:
    ordinary_user = user_factory()
    staff_user = user_factory(is_staff=True)
    factory = APIRequestFactory()

    ordinary_request = factory.get("/api/v1/moderation/reports/")
    force_authenticate(ordinary_request, user=ordinary_user)
    denied = ModerationReportListView.as_view()(ordinary_request)
    assert denied.status_code == 403

    staff_request = factory.get("/api/v1/moderation/reports/")
    force_authenticate(staff_request, user=staff_user)
    staff_only = ModerationReportListView.as_view()(staff_request)
    assert staff_only.status_code == 403

    grant_moderator(staff_user)
    staff_user = User.objects.get(pk=staff_user.pk)
    permitted_request = factory.get("/api/v1/moderation/reports/")
    force_authenticate(permitted_request, user=staff_user)
    allowed = ModerationReportListView.as_view()(permitted_request)
    assert allowed.status_code == 200
