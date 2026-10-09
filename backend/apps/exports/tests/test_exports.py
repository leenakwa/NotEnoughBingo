from __future__ import annotations

import json
import subprocess
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from queue import Queue
from threading import Event
from time import monotonic, sleep
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.db import close_old_connections, connection, transaction
from django.urls import reverse
from django.utils import timezone
from kombu.exceptions import OperationalError as BrokerOperationalError
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.exports.account_data import build_account_export
from apps.exports.models import ExportJob
from apps.exports.renderers import (
    _open_asset,
    _render_text,
    render_revision_pdf,
    render_revision_png,
)
from apps.exports.serializers import ExportJobSerializer
from apps.exports.services import request_account_export
from apps.exports.tasks import process_export_job

pytestmark = pytest.mark.django_db


def _published():
    user = User.objects.create_user(
        username="exportauthor",
        email="export@example.test",
        password="correct horse battery staple",
        email_verified_at=timezone.now(),
    )
    document = empty_draft_document(title="Export me", size=3, language="en")
    document["cells"][0]["text"] = "Export this cell"
    document["visibility"] = "public"
    bingo = create_bingo(author=user, document=document)
    revision = publish_bingo(bingo=bingo, actor=user, idempotency_key="export-publish")
    return user, revision


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("kind", ["bingo", "account_data"])
def test_export_broker_failure_preserves_accepted_job_and_idempotent_retry(kind: str) -> None:
    owner, revision = _published()
    client = APIClient()
    client.force_authenticate(user=owner)
    if kind == "bingo":
        url = reverse("exports:bingo-export-create", kwargs={"bingo_id": revision.bingo.public_id})
        data = {"format": "png"}
        headers = {"HTTP_IDEMPOTENCY_KEY": "unavailable-broker-export"}
        response_id = "id"
    else:
        url = reverse("account-export")
        data = {}
        headers = {}
        response_id = "job_id"

    with patch(
        "apps.exports.tasks.process_export_job.delay",
        side_effect=BrokerOperationalError("transport unavailable"),
    ) as enqueue:
        response = client.post(url, data, format="json", **headers)
        assert response.status_code == 202
        job = ExportJob.objects.get(owner=owner)
        assert response.data[response_id] == str(job.public_id)
        assert response.data["status"] == "queued"
        assert job.status == ExportJob.Status.QUEUED
        assert job.attempt_count == 0
        assert job.error_code == ""
        enqueue.assert_called_once_with(job.pk)

        retried = client.post(url, data, format="json", **headers)
        assert retried.status_code == 202
        assert retried.data[response_id] == str(job.public_id)
        assert ExportJob.objects.filter(owner=owner).count() == 1
        enqueue.assert_called_once_with(job.pk)

    status_response = client.get(
        reverse("exports:export-detail", kwargs={"export_id": job.public_id})
    )
    assert status_response.status_code == 200
    assert status_response.data["status"] == "queued"
    assert status_response.data["download_url"] is None
    assert status_response.data["error"] == ""


@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
@pytest.mark.skipif(connection.vendor != "postgresql", reason="Row locks require PostgreSQL.")
def test_concurrent_first_account_export_requests_reuse_one_job_and_publish_once() -> None:
    owner = User.objects.create(
        username="concurrent_export", email="concurrent-export@example.test"
    )
    first_created, release_first = Event(), Event()
    second_pid: Queue[int] = Queue()

    def worker(pause_before_commit):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                pid = cursor.fetchone()[0]
            if not pause_before_commit:
                second_pid.put(pid)
            with transaction.atomic():
                job = request_account_export(User.objects.get(pk=owner.pk))
                if pause_before_commit:
                    first_created.set()
                    assert release_first.wait(timeout=10), (
                        "First export transaction was not released"
                    )
            return job.pk, pid
        finally:
            close_old_connections()

    with (
        patch("apps.exports.tasks.process_export_job.delay") as enqueue,
        ThreadPoolExecutor(max_workers=2) as executor,
    ):
        first = executor.submit(worker, True)
        try:
            assert first_created.wait(timeout=5), "First export job was not created"
            second = executor.submit(worker, False)
            pid = second_pid.get(timeout=5)
            deadline = monotonic() + 5
            # Ensure real overlap: the competing request either completes before
            # the first commit (the regression) or reaches a PostgreSQL lock wait.
            while not second.done():
                with connection.cursor() as cursor:
                    cursor.execute("SELECT cardinality(pg_blocking_pids(%s)) > 0", [pid])
                    blocked = cursor.fetchone()[0]
                if blocked:
                    break
                assert monotonic() < deadline, "Second request never overlapped the first"
                sleep(0.01)
        finally:
            release_first.set()
        first_job_id, first_pid = first.result(timeout=5)
        second_job_id, other_pid = second.result(timeout=5)

    assert first_pid != other_pid
    assert first_job_id == second_job_id
    job = ExportJob.objects.get(owner=owner, kind=ExportJob.Kind.ACCOUNT_DATA)
    assert job.pk == first_job_id
    assert job.status == ExportJob.Status.QUEUED
    assert job.format == ExportJob.Format.ZIP
    enqueue.assert_called_once_with(job.pk)


def test_png_and_pdf_render_real_files() -> None:
    _, revision = _published()
    png = render_revision_png(revision)
    pdf = render_revision_pdf(revision)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert pdf.startswith(b"%PDF")


def test_exports_shape_supported_languages_and_preserve_all_lines(monkeypatch) -> None:
    samples = [
        "Hello world",
        "Привет мир",
        "Привіт світ",
        "¡Hola mundo!",
        "Bonjour à tous",
        "Grüße aus Köln",
        "Olá, ação e coração",
        "Ciao città",
        "Zażółć gęślą jaźń",
        "İstanbul, çığ ve şeker",
        "مرحبا بالعالم",
        "नमस्ते दुनिया",
        "こんにちは世界",
        "안녕하세요 세계",
        "你好世界",
        "<b>& 🎉 👩🏽‍💻\n1\n2\n3\n4\n5\n6\n7\nEND",
    ]
    layouts = []
    real_run = subprocess.run

    def observe_layout(command, **kwargs):
        diagnostic = Path(command[-1]).with_suffix(".json")
        result = real_run([*command[:-1], f"--serialize-to={diagnostic}", command[-1]], **kwargs)
        layouts.append(json.loads(diagnostic.read_text(encoding="utf-8")))
        return result

    monkeypatch.setattr("apps.exports.renderers.subprocess.run", observe_layout)
    owner, _ = _published()
    document = empty_draft_document(title="Бинго 日本語 العربية हिन्दी 🎉", size=4, language="ru")
    for cell, sample in zip(document["cells"], samples, strict=True):
        cell.update(text=sample, bold=True, italic=True, underline=True, strikethrough=True)
    bingo = create_bingo(author=owner, document=document)
    revision = publish_bingo(bingo=bingo, actor=owner, idempotency_key="multilingual-export")
    png = render_revision_png(revision)
    pdf = render_revision_pdf(revision)
    assert Image.open(BytesIO(png)).size == (1800, 1800)
    assert pdf.startswith(b"%PDF")
    assert set(samples).issubset({layout["text"] for layout in layouts})
    assert document["title"] in {layout["text"] for layout in layouts}
    assert all(layout["output"]["unknown-glyphs"] == 0 for layout in layouts)
    assert all(not layout["output"]["is-ellipsized"] for layout in layouts)
    final = _render_text(
        "\n".join(["long line"] * 8 + ["END"]), width=140, height=140, font_size=29
    )
    assert final.width <= 140
    assert final.height <= 140
    assert layouts[-1]["text"].endswith("END")
    assert layouts[-1]["output"]["height"] <= 140 * 1024


def test_renderer_failure_excludes_user_text_and_native_diagnostics(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise subprocess.TimeoutExpired("private-user-text", 10, stderr="private-native-error")

    monkeypatch.setattr("apps.exports.renderers.subprocess.run", fail)
    with pytest.raises(RuntimeError, match=r"^text_rendering_unavailable$"):
        _render_text("private-user-text", width=140, height=140, font_size=29)


def test_missing_export_image_fails_instead_of_delivering_a_blank_cell(monkeypatch) -> None:
    monkeypatch.setattr("apps.exports.renderers.default_storage.exists", lambda _key: False)
    asset = SimpleNamespace(is_ready=True, storage_key="private-path-marker")
    with pytest.raises(OSError, match=r"^export_image_unavailable$"):
        _open_asset(asset, (140, 140))


def test_export_errors_are_readable_and_expired_jobs_have_no_download() -> None:
    owner, _revision = _published()
    job = ExportJob.objects.create(
        owner=owner,
        kind=ExportJob.Kind.ACCOUNT_DATA,
        format=ExportJob.Format.ZIP,
        status=ExportJob.Status.FAILED,
        error_code="temporary_storage_error",
    )
    assert ExportJobSerializer(job).data["error"] == (
        "The export service is temporarily unavailable. Please try again shortly."
    )
    job.status = ExportJob.Status.PROCESSING
    job.error_code = ""
    job.expires_at = timezone.now() - timedelta(seconds=1)
    data = ExportJobSerializer(job).data
    assert data["status"] == ExportJob.Status.EXPIRED
    assert data["download_url"] is None
    assert "expired" in data["error"]
    job.status = ExportJob.Status.QUEUED
    job.save()
    assert process_export_job.run(job.pk) == "expired"
    job.refresh_from_db()
    assert job.status == ExportJob.Status.EXPIRED
    assert job.output_asset is None


def test_account_export_excludes_authentication_secrets() -> None:
    user, _ = _published()
    user.profile.preferred_languages = ["en", "ru"]
    user.profile.language_preferences_confirmed = True
    user.profile.save(update_fields=("preferred_languages", "language_preferences_confirmed"))
    archive_data = build_account_export(user)
    with zipfile.ZipFile(BytesIO(archive_data)) as archive:
        payload = json.loads(archive.read("not-enough-bingo-account-data.json"))
    serialized = json.dumps(payload)
    assert user.email in serialized
    assert user.password not in serialized
    assert "token_hash" not in serialized
    assert "session_key" not in serialized
    assert payload["profile"]["preferred_languages"] == ["en", "ru"]
    assert payload["profile"]["language_preferences_confirmed"] is True
    assert payload["bingos"][0]["language"] == "en"
    assert payload["bingos"][0]["revisions"][0]["language"] == "en"
