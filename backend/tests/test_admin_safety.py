from __future__ import annotations

import pytest
from django.contrib import admin
from django.test import Client, RequestFactory
from django.urls import reverse

from apps.accounts.models import User
from apps.bingos.models import Bingo, Tag
from apps.bingos.services import create_bingo
from apps.bingos.validators import empty_draft_document
from apps.moderation.models import ModerationAction, Report
from apps.moderation.services import create_report


@pytest.mark.django_db
def test_admin_refuses_hard_deletion_of_users_and_bingos(user_factory) -> None:
    staff = User.objects.create_superuser(
        username="release-admin",
        email="release-admin@example.test",
        password="correct horse battery staple",
    )
    author = user_factory()
    bingo = create_bingo(
        author=author,
        document=empty_draft_document(title="Keep this draft", size=3, language="en"),
    )
    client = Client()
    client.force_login(staff)

    for url in (
        reverse("admin:accounts_user_delete", args=[author.pk]),
        reverse("admin:bingos_bingo_delete", args=[bingo.pk]),
    ):
        assert client.get(url).status_code == 403
        assert client.post(url, {"post": "yes"}).status_code == 403

    assert User.objects.filter(pk=author.pk).exists()
    assert Bingo.objects.filter(pk=bingo.pk).exists()
    request = RequestFactory().get("/admin/bingos/tag/")
    request.user = staff
    assert "delete_selected" not in admin.site._registry[Tag].get_actions(request)


@pytest.mark.django_db
def test_moderation_admin_requires_confirmation_before_hiding_content(
    user_factory, bingo_factory
) -> None:
    staff = User.objects.create_superuser(
        username="moderation-admin",
        email="moderation-admin@example.test",
        password="correct horse battery staple",
    )
    bingo = bingo_factory()
    report = create_report(
        reporter=user_factory(),
        target_type=Report.TargetType.BINGO,
        target=bingo,
        reason=Report.Reason.SPAM,
        description="Spam in this board",
    )
    client = Client()
    client.force_login(staff)
    url = reverse("admin:moderation_report_changelist")
    action_data = {
        "action": "hide_reported_content",
        "_selected_action": [str(report.pk)],
        "index": "0",
        "select_across": "0",
    }

    preview = client.post(url, action_data)
    assert preview.status_code == 200
    assert b"Confirm: Hide reported content" in preview.content
    assert str(report.public_id).encode() in preview.content
    bingo.refresh_from_db()
    assert bingo.hidden_at is None
    assert not ModerationAction.objects.filter(report=report).exists()

    confirmed = client.post(
        url,
        {**action_data, "confirm_moderation_action": "hide_reported_content"},
    )
    assert confirmed.status_code == 302
    bingo.refresh_from_db()
    assert bingo.hidden_at is not None
    assert ModerationAction.objects.filter(
        report=report, action=ModerationAction.Action.HIDE
    ).exists()

    all_selected = client.post(url, {**action_data, "select_across": "1"})
    assert all_selected.status_code == 302
    assert ModerationAction.objects.filter(report=report).count() == 1


@pytest.mark.django_db
def test_moderation_admin_limits_bulk_action_to_twenty_reports(user_factory, bingo_factory) -> None:
    staff = User.objects.create_superuser(
        username="bulk-admin",
        email="bulk-admin@example.test",
        password="correct horse battery staple",
    )
    reporter = user_factory()
    report_ids = [
        str(
            create_report(
                reporter=reporter,
                target_type=Report.TargetType.BINGO,
                target=bingo_factory(),
                reason=Report.Reason.SPAM,
                description="Spam in this board",
            ).pk
        )
        for _ in range(21)
    ]
    client = Client()
    client.force_login(staff)

    response = client.post(
        reverse("admin:moderation_report_changelist"),
        {
            "action": "hide_reported_content",
            "_selected_action": report_ids,
            "index": "0",
            "select_across": "0",
            "confirm_moderation_action": "hide_reported_content",
        },
    )
    assert response.status_code == 302
    assert not ModerationAction.objects.exists()
