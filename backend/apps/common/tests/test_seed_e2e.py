from __future__ import annotations

import io
import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import AccountDeletionRequest, User
from apps.bingos.models import Bingo, BingoRevision
from apps.plays.models import SharedResult
from apps.social.models import Comment

pytestmark = pytest.mark.django_db

FIXTURE_VALUE = "E2E-Test-Password!2026"


def test_seed_e2e_is_disabled_outside_debug_and_test_settings(monkeypatch) -> None:
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.production")
    monkeypatch.setenv("E2E_LIVE", "1")
    monkeypatch.setenv("E2E_FIXTURE_PASSWORD", FIXTURE_VALUE)

    with (
        override_settings(DEBUG=False),
        pytest.raises(
            CommandError,
            match="disabled outside DEBUG and test settings",
        ),
    ):
        call_command("seed_e2e", "--json")


def test_seed_e2e_requires_explicit_opt_in_and_password(monkeypatch) -> None:
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.test")
    monkeypatch.delenv("E2E_LIVE", raising=False)
    monkeypatch.delenv("E2E_FIXTURE_PASSWORD", raising=False)

    with pytest.raises(CommandError, match="Set E2E_LIVE=1"):
        call_command("seed_e2e", "--json")

    monkeypatch.setenv("E2E_LIVE", "1")
    with pytest.raises(CommandError, match="at least 12 characters"):
        call_command("seed_e2e", "--json")


def test_seed_e2e_can_be_rerun_without_duplicate_fixture_state(monkeypatch) -> None:
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.test")
    monkeypatch.setenv("E2E_LIVE", "1")
    monkeypatch.setenv("E2E_FIXTURE_PASSWORD", FIXTURE_VALUE)

    manifests = []
    database_counts = []
    for iteration in range(2):
        output = io.StringIO()
        call_command("seed_e2e", "--json", stdout=output)
        manifests.append(json.loads(output.getvalue()))
        database_counts.append(
            {
                "users": User.objects.filter(email__startswith="e2e-").count(),
                "bingos": Bingo.objects.filter(title__startswith="E2E ").count(),
                "revisions": BingoRevision.objects.filter(title__startswith="E2E ").count(),
                "shares": SharedResult.objects.filter(bingo__title__startswith="E2E ").count(),
                "comments": Comment.objects.filter(bingo__title__startswith="E2E ").count(),
            }
        )
        for role in ("avatar", "deletion"):
            actor = User.objects.get(public_id=manifests[-1]["users"][role]["id"])
            assert actor.is_active
            assert actor.is_email_verified
            assert not actor.is_staff
            assert not actor.is_superuser
            assert actor.check_password(FIXTURE_VALUE)
            assert actor.profile.avatar_id is None
            assert actor.profile.preferred_languages == ["en"]
            assert actor.profile.language_preferences_confirmed
            assert actor.deletion_requested_at is None
            assert actor.deletion_scheduled_for is None
            assert not actor.deletion_requests.exists()
            assert not actor.bingos.exists()
            if iteration == 0:
                requested_at = timezone.now()
                actor.is_staff = True
                actor.is_superuser = True
                actor.email_verified_at = None
                actor.deletion_requested_at = requested_at
                actor.deletion_scheduled_for = requested_at
                actor.save()
                AccountDeletionRequest.objects.create(user=actor, scheduled_for=requested_at)

    assert database_counts == [
        {"users": 5, "bingos": 5, "revisions": 5, "shares": 1, "comments": 30},
        {"users": 5, "bingos": 5, "revisions": 5, "shares": 1, "comments": 30},
    ]
    assert set(manifests[1]["users"]) == {"author", "player", "moderator", "avatar", "deletion"}
    assert len({actor["id"] for actor in manifests[1]["users"].values()}) == 5
    assert [manifest["schema_version"] for manifest in manifests] == [1, 1]
    assert set(manifests[1]["bingos"]) == {"public", "unlisted", "private", "revision", "social"}
    assert (
        Comment.objects.get(public_id=manifests[1]["social_context"]["reply_id"]).parent.public_id
        == Comment.objects.get(public_id=manifests[1]["social_context"]["root_id"]).public_id
    )
    assert manifests[1]["bingos"]["public"]["cell_texts"] == [
        "Morning stretch",
        "Made the bed",
        "Drank water",
        "Took a walk",
        "Called a friend",
        "Read ten pages",
        "Cooked dinner",
        "No-phone hour",
        "Early bedtime",
    ]
    assert manifests[0]["users"] == manifests[1]["users"]
