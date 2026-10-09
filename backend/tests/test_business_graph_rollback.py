from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import HASH_SESSION_KEY
from django.contrib.auth.models import Permission
from django.contrib.sessions.backends.cached_db import SessionStore
from django.contrib.sessions.models import Session
from django.db import IntegrityError
from django.utils import timezone

from apps.accounts.models import SecurityEvent, SessionMetadata, User, UserProfile
from apps.accounts.services import create_authenticated_session
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo, BingoCell, BingoRevision, Draft
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.common.models import IdempotencyRecord
from apps.moderation.models import ModerationAction, Report, ReportStatusHistory
from apps.moderation.services import apply_moderation_action, create_report
from apps.plays.models import PlayProgress, SharedResult
from apps.plays.services import create_shared_result, replace_progress

pytestmark = [pytest.mark.django_db, pytest.mark.integration]


def _rows(queryset):
    return list(queryset.order_by("pk").values())


def _moderation_snapshot(bingo, target):
    return {
        "bingo": Bingo.objects.filter(pk=bingo.pk).values().get(),
        "user": User.objects.filter(pk=target.pk).values().get(),
        "profile": UserProfile.objects.filter(user=target).values().get(),
        "reports": _rows(Report.objects.all()),
        "actions": _rows(ModerationAction.objects.all()),
        "history": _rows(ReportStatusHistory.objects.all()),
        "metadata": _rows(SessionMetadata.objects.all()),
        "sessions": _rows(Session.objects.all()),
        "security_events": _rows(SecurityEvent.objects.all()),
    }


def _authenticated_session(user, csrf_request):
    request = csrf_request("post", "/api/v1/auth/login/", user=user, with_session=True)
    metadata = create_authenticated_session(request, user)
    request.session["saved_board"] = "retained session data"
    request.session.save()
    key = request.session.session_key
    payload = SessionStore(key).load()
    assert payload[HASH_SESSION_KEY] == user.get_session_auth_hash()
    return metadata, key, payload


@pytest.mark.parametrize(
    "action",
    [ModerationAction.Action.HIDE, ModerationAction.Action.SUSPEND_USER],
    ids=["hide-board", "suspend-profile"],
)
def test_final_moderation_history_sql_failure_restores_content_audit_and_sessions(
    action,
    verified_user_factory,
    bingo_factory,
    csrf_request,
    django_capture_on_commit_callbacks,
) -> None:
    moderator = verified_user_factory(is_staff=True)
    moderator.user_permissions.add(
        Permission.objects.get(codename="moderate_content"),
        Permission.objects.get(codename="view_private_content"),
    )
    reporter = verified_user_factory()
    target = verified_user_factory()
    bingo = bingo_factory(author=target)
    active_sessions = []
    retained_sessions = []
    if action == ModerationAction.Action.SUSPEND_USER:
        active_sessions = [
            _authenticated_session(target, csrf_request),
            _authenticated_session(target, csrf_request),
        ]
        revoked = _authenticated_session(target, csrf_request)
        revoked[0].revoked_at = timezone.now() - timedelta(minutes=5)
        revoked[0].save(update_fields=("revoked_at",))
        retained_sessions = [
            revoked,
            _authenticated_session(verified_user_factory(), csrf_request),
        ]
    report_target = target.profile if action == ModerationAction.Action.SUSPEND_USER else bingo
    target_type = (
        Report.TargetType.PROFILE
        if action == ModerationAction.Action.SUSPEND_USER
        else Report.TargetType.BINGO
    )
    prior_report = create_report(
        reporter=reporter,
        target_type=target_type,
        target=report_target,
        reason=Report.Reason.OTHER,
        description="A retained previous report",
    )
    apply_moderation_action(
        report=prior_report,
        moderator=moderator,
        action=ModerationAction.Action.RESOLVE_NO_ACTION,
        reason="Retained previous decision",
    )
    report = create_report(
        reporter=reporter,
        target_type=target_type,
        target=report_target,
        reason=Report.Reason.HARASSMENT,
        description="Report whose decision must roll back",
    )
    before = _moderation_snapshot(bingo, target)
    save_history = ReportStatusHistory.save
    reached = {}

    def fail_required_history_relation(instance, *args, **kwargs):
        reached.update(_moderation_snapshot(bingo, target))
        assert instance.report_id == report.pk
        # Keep the real final INSERT, but make its NOT NULL constraint fail.
        instance.report_id = None
        return save_history(instance, *args, **kwargs)

    with patch("apps.moderation.services.send_critical_security_email.delay") as dispatch:
        with django_capture_on_commit_callbacks(execute=True) as failed_callbacks:
            with (
                patch.object(
                    ReportStatusHistory,
                    "save",
                    autospec=True,
                    side_effect=fail_required_history_relation,
                ) as failed_write,
                pytest.raises(IntegrityError),
            ):
                apply_moderation_action(
                    report=report,
                    moderator=moderator,
                    action=action,
                    reason="Confirmed policy violation",
                )

        failed_write.assert_called_once()
        assert failed_callbacks == []
        dispatch.assert_not_called()
        assert len(reached["actions"]) == len(before["actions"]) + 1
        changed_report = next(row for row in reached["reports"] if row["id"] == report.pk)
        assert changed_report["status"] == Report.Status.RESOLVED
        assert changed_report["assigned_moderator_id"] == moderator.pk
        assert changed_report["decision"] == "Confirmed policy violation"
        if action == ModerationAction.Action.HIDE:
            assert reached["bingo"]["hidden_at"] is not None
            assert reached["bingo"]["hidden_reason"] == "Confirmed policy violation"
        else:
            assert reached["user"]["suspended_at"] is not None
            active_keys = {key for _, key, _ in active_sessions}
            assert not active_keys.intersection(row["session_key"] for row in reached["sessions"])
            assert all(
                row["revoked_at"] is not None
                for row in reached["metadata"]
                if row["session_key"] in active_keys
            )

        assert _moderation_snapshot(bingo, target) == before
        target.refresh_from_db()
        for _, key, payload in active_sessions + retained_sessions:
            # Eager cache eviction is reversible through the restored durable row.
            assert SessionStore(key).load() == payload
        for _, key, _ in active_sessions:
            assert SessionStore(key).load()[HASH_SESSION_KEY] == target.get_session_auth_hash()

        with django_capture_on_commit_callbacks(execute=True) as committed_callbacks:
            audit = apply_moderation_action(
                report=report,
                moderator=moderator,
                action=action,
                reason="Confirmed policy violation",
            )
            dispatch.assert_not_called()

        after = _moderation_snapshot(bingo, target)
        report.refresh_from_db()
        assert report.status == Report.Status.RESOLVED
        assert report.assigned_moderator_id == moderator.pk
        assert report.decision == "Confirmed policy violation"
        assert report.resolved_at is not None
        assert report.actions.count() == 1
        assert report.status_history.count() == 2
        assert audit.report_id == report.pk
        assert audit.action == action
        assert audit.target_public_id == str(report_target.public_id)
        history = report.status_history.get(to_status=Report.Status.RESOLVED)
        assert history.from_status == Report.Status.OPEN
        assert history.changed_by_id == moderator.pk
        assert history.note == audit.reason == report.decision
        for name, model in (
            ("actions", ModerationAction),
            ("history", ReportStatusHistory),
        ):
            assert (
                _rows(model.objects.filter(pk__in=[row["id"] for row in before[name]]))
                == before[name]
            )
            assert len(after[name]) == len(before[name]) + 1
        assert _rows(Report.objects.exclude(pk=report.pk)) == [
            row for row in before["reports"] if row["id"] != report.pk
        ]
        assert after["profile"] == before["profile"]
        assert after["security_events"] == before["security_events"]
        if action == ModerationAction.Action.HIDE:
            bingo.refresh_from_db()
            assert bingo.hidden_at is not None
            assert bingo.hidden_reason == "Confirmed policy violation"
            assert after["user"] == before["user"]
            assert after["metadata"] == before["metadata"]
            assert after["sessions"] == before["sessions"]
            assert committed_callbacks == []
            dispatch.assert_not_called()
        else:
            target.refresh_from_db()
            assert target.suspended_at is not None
            assert target.suspension_reason == "Confirmed policy violation"
            assert target.password == before["user"]["password"]
            assert after["bingo"] == before["bingo"]
            for metadata, key, _ in active_sessions:
                metadata.refresh_from_db()
                assert metadata.revoked_at is not None
                assert not Session.objects.filter(session_key=key).exists()
                assert SessionStore(key).load() == {}
            for metadata, key, payload in retained_sessions:
                assert SessionStore(key).load() == payload
                assert SessionMetadata.objects.filter(pk=metadata.pk).values().get() == next(
                    row for row in before["metadata"] if row["id"] == metadata.pk
                )
            assert committed_callbacks
            dispatch.assert_called_once_with(
                target.pk,
                "Your Not Enough Bingo account was suspended",
                "Your account was suspended. Contact support if you believe this is an error.",
            )


def _share_snapshot(bingo):
    return {
        "bingo": Bingo.objects.filter(pk=bingo.pk).values().get(),
        "draft": Draft.objects.filter(bingo=bingo).values().get(),
        "revisions": _rows(BingoRevision.objects.filter(bingo=bingo)),
        "cells": _rows(BingoCell.objects.filter(revision__bingo=bingo)),
        "progress": _rows(PlayProgress.objects.filter(bingo=bingo)),
        "shares": _rows(SharedResult.objects.filter(bingo=bingo)),
        "events": _rows(InteractionEvent.objects.filter(bingo=bingo)),
        "idempotency": _rows(IdempotencyRecord.objects.all()),
    }


@pytest.mark.parametrize("guest", [False, True], ids=["authenticated", "guest"])
@pytest.mark.parametrize("expired_key", [False, True], ids=["new-key", "expired-key"])
def test_final_share_idempotency_sql_failure_restores_share_event_counter_and_prior_records(
    guest,
    expired_key,
    verified_user_factory,
    django_capture_on_commit_callbacks,
) -> None:
    author = verified_user_factory()
    document = empty_draft_document(title="Retained publication", size=3, language="en")
    document["visibility"] = "public"
    document["cells"][0]["text"] = "Retained cell"
    bingo = create_bingo(author=author, document=document)
    revision = publish_bingo(bingo=bingo, actor=author, idempotency_key="retained-publication")
    cells = [str(cell.public_id) for cell in revision.cells.order_by("position")]
    replace_progress(user=author, bingo=bingo, selected_cells=[cells[0]], expected_version=0)
    actor = None if guest else author
    guest_hash = "a" * 64 if guest else ""
    scope = f"share:guest:{guest_hash}" if guest else f"share:user:{author.pk}"
    key = "share-to-retry"
    previous = create_shared_result(
        bingo=bingo,
        revision_id=revision.public_id,
        selected_cells=[cells[0]],
        display_name="Retained result",
        idempotency_key=key if expired_key else "retained-share",
        actor=actor,
        guest_hash=guest_hash,
    )
    if expired_key:
        IdempotencyRecord.objects.filter(key=key, scope=scope).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
    before = _share_snapshot(bingo)
    save_idempotency = IdempotencyRecord.save
    reached = {}

    def share():
        return create_shared_result(
            bingo=bingo,
            revision_id=revision.public_id,
            selected_cells=[cells[1], cells[2]],
            display_name="  Current   result  ",
            idempotency_key=key,
            actor=actor,
            guest_hash=guest_hash,
        )

    def fail_required_idempotency_key(instance, *args, **kwargs):
        reached.update(_share_snapshot(bingo))
        assert instance.key == key
        assert instance.scope == scope
        # The result, event and counter have already been written at this point.
        instance.key = None
        return save_idempotency(instance, *args, **kwargs)

    with django_capture_on_commit_callbacks(execute=True) as failed_callbacks:
        with (
            patch.object(
                IdempotencyRecord,
                "save",
                autospec=True,
                side_effect=fail_required_idempotency_key,
            ) as failed_write,
            pytest.raises(IntegrityError),
        ):
            share()

    failed_write.assert_called_once()
    assert failed_callbacks == []
    assert len(reached["shares"]) == len(before["shares"]) + 1
    assert len(reached["events"]) == len(before["events"]) + 1
    assert reached["bingo"]["share_count"] == before["bingo"]["share_count"] + 1
    assert _share_snapshot(bingo) == before

    with django_capture_on_commit_callbacks(execute=True) as committed_callbacks:
        retried = share()
    assert committed_callbacks == []
    after = _share_snapshot(bingo)
    assert len(after["shares"]) == len(before["shares"]) + 1
    assert len(after["events"]) == len(before["events"]) + 1
    assert after["bingo"]["share_count"] == before["bingo"]["share_count"] + 1
    assert retried.pk != previous.pk
    assert retried.revision_id == revision.pk
    assert retried.selected_cells == [cells[1], cells[2]]
    assert retried.owner_display_name == "Current result"
    assert retried.owner_id == (None if guest else author.pk)
    assert retried.guest_session_hash == guest_hash
    assert retried.access == SharedResult.Access.PUBLIC
    event = InteractionEvent.objects.get(
        bingo=bingo, metadata={"shared_result_id": str(retried.public_id)}
    )
    assert event.event_type == InteractionEvent.Type.SHARE
    assert event.source == InteractionEvent.Source.SERVER
    assert event.actor_id == retried.owner_id
    assert event.anonymous_id_hash == guest_hash
    assert event.revision_id == revision.pk
    record = IdempotencyRecord.objects.get(key=key, scope=scope)
    assert record.method == "POST"
    assert record.path == f"/api/v1/bingos/{bingo.public_id}/shares/"
    assert record.response_status == 201
    assert record.response_body == {"share_id": retried.share_id}
    assert record.expires_at > timezone.now()
    for name in ("draft", "revisions", "cells", "progress"):
        assert after[name] == before[name]
    assert (
        _rows(SharedResult.objects.filter(pk__in=[row["id"] for row in before["shares"]]))
        == before["shares"]
    )
    assert (
        _rows(InteractionEvent.objects.filter(pk__in=[row["id"] for row in before["events"]]))
        == before["events"]
    )
    retained_records = [
        row for row in before["idempotency"] if row["scope"] != scope or row["key"] != key
    ]
    assert _rows(IdempotencyRecord.objects.exclude(pk=record.pk)) == retained_records

    repeated = share()
    assert repeated.pk == retried.pk
    assert _share_snapshot(bingo) == after
