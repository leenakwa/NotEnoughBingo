"""Persisted ORM defaults, callable isolation and explicit SQL default policy."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone
from freezegun import freeze_time

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    UserProfile,
)
from apps.analytics.models import BingoDailyMetric, InteractionEvent
from apps.bingos.models import Bingo, BingoCell, BingoRevision, BingoTag, Draft, Tag
from apps.exports.models import ExportJob
from apps.media_assets.models import MediaAsset
from apps.moderation.models import ModerationAction, Report
from apps.notifications.models import Notification
from apps.plays.models import PlayProgress, SharedResult
from apps.social.models import Comment

pytestmark = pytest.mark.django_db


@pytest.fixture
def default_records_factory(user_factory):
    def create(label: str):
        now = timezone.now()
        user = user_factory()
        bingo = Bingo.objects.create(author=user)
        revision = BingoRevision.objects.create(
            bingo=bingo,
            revision_number=1,
            title="Default contract board",
            size=5,
            visibility="private",
            marking_style="checkmark",
            document_hash="0" * 64,
            published_by=user,
        )
        tag = Tag.objects.create(name=label, slug=label)
        report = Report.objects.create(
            reporter=user, target_type="bingo", bingo=bingo, reason="spam"
        )
        return {
            "user": user,
            "profile": user.profile,
            "privacy": user.privacy,
            "notification_preferences": user.notification_preferences,
            "verification": EmailVerification.objects.create(
                user=user,
                email=user.email,
                purpose="verify_email",
                token_hash=label.ljust(64, "0"),
                expires_at=now + timedelta(days=1),
            ),
            "session_metadata": SessionMetadata.objects.create(
                user=user,
                session_key=label,
                last_seen_at=now,
                expires_at=now + timedelta(days=1),
            ),
            "security_event": SecurityEvent.objects.create(user=user, event_type="registered"),
            "deletion_request": AccountDeletionRequest.objects.create(
                user=user, scheduled_for=now + timedelta(days=14)
            ),
            "interaction": InteractionEvent.objects.create(
                actor=user, event_type="page_view", occurred_at=now
            ),
            "daily_metric": BingoDailyMetric.objects.create(bingo=bingo, date=now.date()),
            "bingo": bingo,
            "draft": Draft.objects.create(bingo=bingo, saved_by=user),
            "revision": revision,
            "cell": BingoCell.objects.create(revision=revision, row=0, column=0, position=0),
            "tag": tag,
            "bingo_tag": BingoTag.objects.create(bingo=bingo, tag=tag),
            "export": ExportJob.objects.create(owner=user, kind="account_data", format="zip"),
            "asset": MediaAsset.objects.create(
                owner=user, kind="avatar", storage_key=f"defaults/{label}"
            ),
            "report": report,
            "moderation_action": ModerationAction.objects.create(
                moderator=user,
                report=report,
                action="dismiss",
                target_type="bingo",
                target_public_id=str(bingo.public_id),
                reason="Default contract",
            ),
            "notification": Notification.objects.create(
                recipient=user, notification_type="bingo_like", dedupe_key=label
            ),
            "progress": PlayProgress.objects.create(user=user, bingo=bingo, revision=revision),
            "shared": SharedResult.objects.create(
                bingo=bingo, revision=revision, owner=user, owner_display_name="Default owner"
            ),
            "comment": Comment.objects.create(bingo=bingo, author=user, body="Default comment"),
        }

    return create


def test_business_defaults_are_persisted_without_caller_overrides(default_records_factory) -> None:
    records = default_records_factory("business-defaults")
    contracts = {
        "user": {"is_active": True, "is_staff": False, "is_superuser": False},
        "profile": {"preferred_languages": [], "language_preferences_confirmed": False},
        "privacy": {
            "show_bio": True,
            "show_created_bingos": True,
            "show_play_history": True,
            "show_shared_results": True,
            "show_followers": True,
            "show_following": True,
        },
        "notification_preferences": {
            "new_comment": True,
            "comment_reply": True,
            "bingo_like": True,
            "comment_like": True,
            "new_follower": True,
            "marketing_email": False,
        },
        "verification": {"attempt_count": 0, "delivery": {}},
        "security_event": {"metadata": {}},
        "deletion_request": {"status": "scheduled"},
        "interaction": {"source": "client", "metadata": {}},
        "daily_metric": {
            "impressions": 0,
            "views": 0,
            "opens": 0,
            "likes": 0,
            "unlikes": 0,
            "starts": 0,
            "completes": 0,
            "resets": 0,
            "shares": 0,
            "comments": 0,
        },
        "bingo": {
            "language": "und",
            "size": 5,
            "status": "draft",
            "visibility": "private",
            "marking_style": "checkmark",
            "marking_config": {},
            "view_count": 0,
            "like_count": 0,
            "comment_count": 0,
            "play_count": 0,
            "share_count": 0,
            "trending_score": 0,
        },
        "draft": {"document": {}, "schema_version": 1, "version": 1},
        "revision": {"language": "und", "marking_config": {}, "schema_version": 1},
        "cell": {
            "text_color": "#000000",
            "bold": False,
            "italic": False,
            "underline": False,
            "strikethrough": False,
            "background_color": "#ffffff",
            "background_opacity": Decimal("1.000"),
            "image_alt": "",
            "image_opacity": Decimal("1.000"),
            "border_color": "#000000",
            "border_width": 1,
            "border_style": "solid",
        },
        "tag": {"usage_count": 0},
        "bingo_tag": {"position": 0},
        "export": {"status": "queued", "parameters": {}, "attempt_count": 0},
        "asset": {
            "status": "pending",
            "variant": "original",
            "expected_size": 1,
            "processing_attempt_count": 0,
        },
        "report": {"status": "open", "context_snapshot": {}},
        "moderation_action": {"metadata": {}},
        "notification": {"is_read": False},
        "progress": {"selected_cells": [], "version": 1},
        "shared": {"selected_cells": [], "access": "public"},
        "comment": {"like_count": 0, "reply_count": 0},
    }
    for name, expected in contracts.items():
        record = records[name]
        record.refresh_from_db()
        assert {field: getattr(record, field) for field in expected} == expected, name
    assert records["bingo"].is_publicly_listed is False


@pytest.mark.parametrize(
    ("model", "field", "empty"),
    [
        (UserProfile, "preferred_languages", []),
        (EmailVerification, "delivery", {}),
        (SecurityEvent, "metadata", {}),
        (InteractionEvent, "metadata", {}),
        (Bingo, "marking_config", {}),
        (Draft, "document", {}),
        (BingoRevision, "marking_config", {}),
        (ExportJob, "parameters", {}),
        (Report, "context_snapshot", {}),
        (ModerationAction, "metadata", {}),
        (PlayProgress, "selected_cells", []),
        (SharedResult, "selected_cells", []),
    ],
)
def test_json_defaults_are_independent_for_each_new_instance(model, field, empty) -> None:
    first, second = model(), model()
    first_value = getattr(first, field)
    second_value = getattr(second, field)
    assert first_value == second_value == empty
    assert first_value is not second_value
    if isinstance(first_value, list):
        first_value.append("first-instance-only")
    else:
        first_value["first-instance-only"] = True
    assert second_value == empty


def test_verification_delivery_sql_default_allows_an_old_writer_to_omit_the_column(
    user_factory,
) -> None:
    user = user_factory()
    now = timezone.now()
    verification = EmailVerification(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.VERIFY_EMAIL,
        token_hash=str(user.public_id).replace("-", "").ljust(64, "0"),
        expires_at=now + timedelta(hours=1),
        created_at=now,
        updated_at=now,
    )
    # This is the pre-migration writer's actual column list: delivery is absent.
    names = (
        "public_id",
        "created_at",
        "updated_at",
        "user",
        "email",
        "purpose",
        "token_hash",
        "expires_at",
        "used_at",
        "attempt_count",
        "pending_username",
        "pending_display_name",
        "pending_password_hash",
    )
    values = [
        EmailVerification._meta.get_field(name).get_db_prep_save(
            getattr(verification, EmailVerification._meta.get_field(name).attname), connection
        )
        for name in names
    ]
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO accounts_emailverification "
            "(public_id, created_at, updated_at, user_id, email, purpose, token_hash, "
            "expires_at, used_at, attempt_count, pending_username, pending_display_name, "
            "pending_password_hash) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            values,
        )
    persisted = EmailVerification.objects.get(public_id=verification.public_id)
    assert persisted.delivery == {}
    assert persisted.token_hash == verification.token_hash


def test_callable_ids_and_timestamps_are_generated_for_each_persisted_record(
    default_records_factory,
) -> None:
    earlier = "2026-10-08T10:00:00+00:00"
    later = "2026-10-08T10:05:00+00:00"
    with freeze_time(earlier):
        first = default_records_factory("first-callables")
    with freeze_time(later):
        second = default_records_factory("second-callables")
    public_records = (
        "user",
        "profile",
        "verification",
        "session_metadata",
        "security_event",
        "deletion_request",
        "interaction",
        "bingo",
        "draft",
        "revision",
        "cell",
        "tag",
        "export",
        "asset",
        "report",
        "moderation_action",
        "notification",
        "progress",
        "shared",
        "comment",
    )
    identifiers = []
    timestamped_records = (
        "profile",
        "privacy",
        "notification_preferences",
        "verification",
        "session_metadata",
        "security_event",
        "deletion_request",
        "daily_metric",
        "bingo",
        "draft",
        "revision",
        "tag",
        "export",
        "asset",
        "report",
        "moderation_action",
        "notification",
        "progress",
        "shared",
        "comment",
    )
    for records, expected_time in ((first, earlier), (second, later)):
        for name in public_records:
            record = records[name]
            record.refresh_from_db()
            assert record.public_id.version == 4, name
            identifiers.append(record.public_id)
        for name in timestamped_records:
            record = records[name]
            record.refresh_from_db()
            assert record.created_at == datetime.fromisoformat(expected_time), name
            assert record.updated_at == datetime.fromisoformat(expected_time), name
        assert records["user"].date_joined == datetime.fromisoformat(expected_time)
        assert re.fullmatch(r"[A-Za-z0-9_-]{32}", records["shared"].share_id)
    assert len(set(identifiers)) == len(identifiers)
    assert first["shared"].share_id != second["shared"].share_id
    assert first["revision"].published_at == datetime.fromisoformat(earlier)
    assert second["revision"].published_at == datetime.fromisoformat(later)


def test_saving_a_mutable_record_advances_updated_at_and_preserves_created_at(user_factory) -> None:
    earlier = "2026-10-08T10:00:00+00:00"
    later = "2026-10-08T10:05:00+00:00"
    with freeze_time(earlier):
        bingo = Bingo.objects.create(author=user_factory())
    with freeze_time(later):
        bingo.title = "Changed draft title"
        bingo.save(update_fields=("title", "updated_at"))
    bingo.refresh_from_db()
    assert bingo.title == "Changed draft title"
    assert bingo.created_at == datetime.fromisoformat(earlier)
    assert bingo.updated_at == datetime.fromisoformat(later)
    with freeze_time("2026-10-08T11:00:00+00:00"):
        bingo.refresh_from_db()
    assert bingo.updated_at == datetime.fromisoformat(later)


def test_orm_business_defaults_are_not_implicit_postgresql_column_defaults() -> None:
    if connection.vendor != "postgresql":
        pytest.skip("PostgreSQL column-default policy check")
    contracts = {
        "accounts_user": {"is_active", "is_staff", "is_superuser", "date_joined"},
        "accounts_userprofile": {"preferred_languages", "language_preferences_confirmed"},
        "accounts_notificationpreference": {"marketing_email"},
        "bingos_bingo": {"status", "visibility", "marking_config", "like_count"},
        "exports_exportjob": {"status", "parameters", "attempt_count"},
        "media_assets_mediaasset": {"status", "variant", "processing_attempt_count"},
    }
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT table_name, column_name, column_default FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = ANY(%s)",
            [list(contracts)],
        )
        defaults = {
            (table, column): default
            for table, column, default in cursor.fetchall()
            if column in contracts[table]
        }
    expected = {(table, column) for table, columns in contracts.items() for column in columns}
    assert defaults.keys() == expected
    assert all(default is None for default in defaults.values()), defaults
