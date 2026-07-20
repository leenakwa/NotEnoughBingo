from __future__ import annotations

import json
import zipfile
from io import BytesIO

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.exports.account_data import build_account_export
from apps.exports.renderers import render_revision_pdf, render_revision_png

pytestmark = pytest.mark.django_db


def _published():
    user = User.objects.create_user(
        username="exportauthor",
        email="export@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )
    document = empty_draft_document(title="Export me", size=3)
    document["visibility"] = "public"
    bingo = create_bingo(author=user, document=document)
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="export-publish")
    return user, revision


def test_png_and_pdf_render_real_files() -> None:
    _, revision = _published()
    png = render_revision_png(revision)
    pdf = render_revision_pdf(revision)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert pdf.startswith(b"%PDF")


def test_account_export_excludes_authentication_secrets() -> None:
    user, _ = _published()
    archive_data = build_account_export(user)
    with zipfile.ZipFile(BytesIO(archive_data)) as archive:
        payload = json.loads(archive.read("not-enough-bingo-account-data.json"))
    serialized = json.dumps(payload)
    assert user.email in serialized
    assert user.password not in serialized
    assert "token_hash" not in serialized
    assert "session_key" not in serialized
