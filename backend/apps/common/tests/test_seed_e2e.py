from __future__ import annotations

import io
import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.accounts.models import User
from apps.bingos.models import Bingo, BingoRevision
from apps.plays.models import SharedResult

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
    for _ in range(2):
        output = io.StringIO()
        call_command("seed_e2e", "--json", stdout=output)
        manifests.append(json.loads(output.getvalue()))
        database_counts.append(
            {
                "users": User.objects.filter(email__startswith="e2e-").count(),
                "bingos": Bingo.objects.filter(title__startswith="E2E ").count(),
                "revisions": BingoRevision.objects.filter(title__startswith="E2E ").count(),
                "shares": SharedResult.objects.filter(bingo__title__startswith="E2E ").count(),
            }
        )

    assert database_counts == [
        {"users": 3, "bingos": 4, "revisions": 4, "shares": 1},
        {"users": 3, "bingos": 4, "revisions": 4, "shares": 1},
    ]
    assert [manifest["schema_version"] for manifest in manifests] == [1, 1]
    assert set(manifests[1]["bingos"]) == {"public", "unlisted", "private", "revision"}
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
