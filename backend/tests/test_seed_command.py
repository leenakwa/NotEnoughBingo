from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.accounts.models import User
from apps.bingos.models import Bingo, BingoRevision

pytestmark = pytest.mark.django_db


@override_settings(DEBUG=False)
def test_seed_dev_refuses_to_run_outside_debug_mode() -> None:
    with pytest.raises(CommandError, match="disabled unless DEBUG=true"):
        call_command("seed_dev", password="Local-Seed-Credential-42")

    assert not User.objects.filter(email__endswith="@example.test").exists()
    assert not Bingo.objects.exists()


@override_settings(DEBUG=True)
def test_seed_dev_is_deterministic_and_idempotent() -> None:
    credential = "Local-Seed-Credential-42"
    first_output = StringIO()
    second_output = StringIO()

    call_command("seed_dev", password=credential, stdout=first_output)
    seeded_bingo_ids = set(Bingo.objects.values_list("public_id", flat=True))
    seeded_revision_ids = set(BingoRevision.objects.values_list("public_id", flat=True))
    call_command("seed_dev", password=credential, stdout=second_output)

    users = User.objects.filter(email__in=("alex@example.test", "mira@example.test"))
    assert users.count() == 2
    assert all(user.is_email_verified for user in users)
    assert all(user.check_password(credential) for user in users)
    assert Bingo.objects.count() == 3
    assert BingoRevision.objects.count() == 3
    assert (
        Bingo.objects.filter(
            status=Bingo.Status.PUBLISHED,
            visibility=Bingo.Visibility.PUBLIC,
        ).count()
        == 2
    )
    assert (
        Bingo.objects.filter(
            status=Bingo.Status.PUBLISHED,
            visibility=Bingo.Visibility.UNLISTED,
        ).count()
        == 1
    )
    assert set(Bingo.objects.values_list("public_id", flat=True)) == seeded_bingo_ids
    assert set(BingoRevision.objects.values_list("public_id", flat=True)) == seeded_revision_ids
    assert "3 new bingos" in first_output.getvalue()
    assert "0 new bingos" in second_output.getvalue()
