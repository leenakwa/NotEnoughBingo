from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, call, patch

import pytest
from django.conf import settings
from django.db import connection
from django.utils import timezone
from kombu.exceptions import OperationalError as BrokerOperationalError

from apps.accounts.models import User
from apps.common.jobs import job_lock_key, periodic_task, publish_job
from apps.common.tasks import recover_stalled_jobs
from apps.exports.models import ExportJob
from apps.exports.tasks import process_export_job
from apps.media_assets.models import MediaAsset
from apps.media_assets.tasks import process_media_asset


def test_publish_job_keeps_transport_failure_logs_safe(caplog) -> None:
    task = SimpleNamespace(
        name="tests.recoverable_job",
        delay=Mock(side_effect=BrokerOperationalError("sensitive broker detail")),
    )
    assert publish_job(task, 7) is False
    task.delay.assert_called_once_with(7)
    record = next(
        record for record in caplog.records if record.msg == "scheduled.job.publish_failed"
    )
    assert record.task_name == task.name
    assert record.job_id == 7
    assert record.outcome == "pending"
    assert record.exc_info is None
    assert "sensitive broker detail" not in caplog.text

    task.delay.reset_mock(side_effect=True)
    assert publish_job(task, 7) is True
    task.delay.assert_called_once_with(7)


def test_publish_job_does_not_hide_unexpected_errors() -> None:
    task = SimpleNamespace(name="tests.broken_job", delay=Mock(side_effect=ValueError("bad task")))
    with pytest.raises(ValueError, match="bad task"):
        publish_job(task, 7)


@pytest.mark.django_db(transaction=True)
def test_periodic_job_skips_overlap_and_releases_lock_after_failure() -> None:
    executions = []

    def maintenance():
        executions.append(True)
        if len(executions) == 1:
            raise ValueError("test failure")
        return 7

    task = periodic_task(maintenance)
    key = job_lock_key(f"{maintenance.__module__}.{maintenance.__name__}")
    other = connection.copy(alias="job-lock-probe")
    try:
        with other.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_lock(%s)", [key])
        assert task.run() is None
        assert executions == []
        with other.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [key])
        with pytest.raises(ValueError, match="test failure"):
            task.run()
        with other.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", [key])
            assert cursor.fetchone()[0] is True
            cursor.execute("SELECT pg_advisory_unlock(%s)", [key])
        assert task.run() == 7
    finally:
        other.close()


@pytest.mark.django_db
def test_stalled_sweep_requeues_old_claims_once_and_bounds_repeated_crashes(
    django_capture_on_commit_callbacks,
) -> None:
    owner = User.objects.create(username="worker_recovery_owner", email="recovery@example.test")
    old = timezone.now() - timedelta(seconds=settings.CELERY_TASK_TIME_LIMIT + 120)
    jobs = [
        ExportJob.objects.create(
            owner=owner,
            kind=ExportJob.Kind.ACCOUNT_DATA,
            format=ExportJob.Format.ZIP,
            status=ExportJob.Status.PROCESSING,
            attempt_count=attempts,
        )
        for attempts in (2, 5)
    ]
    ExportJob.objects.filter(pk__in=[job.pk for job in jobs]).update(updated_at=old)
    media = [
        MediaAsset.objects.create(
            owner=owner,
            kind=MediaAsset.Kind.CELL_IMAGE,
            storage_key=f"test/stalled-{attempts}",
            status=MediaAsset.Status.PROCESSING,
            processing_task_id="old-claim",
            processing_attempt_count=attempts,
        )
        for attempts in (2, 5)
    ]
    MediaAsset.objects.filter(pk__in=[asset.pk for asset in media]).update(updated_at=old)
    active = ExportJob.objects.create(
        owner=owner,
        kind=ExportJob.Kind.ACCOUNT_DATA,
        format=ExportJob.Format.ZIP,
        status=ExportJob.Status.PROCESSING,
    )
    with (
        patch("apps.exports.tasks.process_export_job.delay") as export_delay,
        patch("apps.media_assets.tasks.process_media_asset.delay") as media_delay,
        django_capture_on_commit_callbacks(execute=True),
    ):
        assert recover_stalled_jobs.run() == {"exports": 1, "media": 1, "failed": 2}
        assert recover_stalled_jobs.run() == {"exports": 0, "media": 0, "failed": 0}
    export_delay.assert_called_once_with(jobs[0].pk)
    media_delay.assert_called_once_with(media[0].pk)
    jobs[1].refresh_from_db()
    media[1].refresh_from_db()
    active.refresh_from_db()
    assert jobs[1].status == ExportJob.Status.FAILED
    assert jobs[1].error_code == "worker_interrupted"
    assert media[1].status == MediaAsset.Status.REJECTED
    assert media[1].processing_task_id == ""
    assert active.status == ExportJob.Status.PROCESSING


@pytest.mark.django_db
def test_pending_jobs_recover_after_five_minutes_without_interrupting_active_workers(
    django_capture_on_commit_callbacks,
) -> None:
    owner = User.objects.create(username="pending_recovery_owner", email="pending@example.test")
    old = timezone.now() - timedelta(minutes=6)
    jobs = [
        ExportJob.objects.create(
            owner=owner,
            kind=ExportJob.Kind.ACCOUNT_DATA,
            format=ExportJob.Format.ZIP,
            status=status,
        )
        for status in (ExportJob.Status.QUEUED, ExportJob.Status.PROCESSING)
    ]
    media = [
        MediaAsset.objects.create(
            owner=owner,
            kind=MediaAsset.Kind.CELL_IMAGE,
            storage_key=f"test/pending-{status}",
            status=status,
        )
        for status in (MediaAsset.Status.UPLOADED, MediaAsset.Status.PROCESSING)
    ]
    ExportJob.objects.filter(pk__in=[job.pk for job in jobs]).update(updated_at=old)
    MediaAsset.objects.filter(pk__in=[asset.pk for asset in media]).update(updated_at=old)
    with (
        patch("apps.exports.tasks.process_export_job.delay") as export_delay,
        patch("apps.media_assets.tasks.process_media_asset.delay") as media_delay,
        django_capture_on_commit_callbacks(execute=True),
    ):
        assert recover_stalled_jobs.run() == {"exports": 1, "media": 1, "failed": 0}
    export_delay.assert_called_once_with(jobs[0].pk)
    media_delay.assert_called_once_with(media[0].pk)
    jobs[1].refresh_from_db()
    media[1].refresh_from_db()
    assert jobs[1].status == ExportJob.Status.PROCESSING
    assert jobs[1].updated_at == old
    assert media[1].status == MediaAsset.Status.PROCESSING
    assert media[1].updated_at == old


@pytest.mark.django_db(transaction=True)
def test_recovery_publication_failure_does_not_stop_other_jobs_and_retries_next_sweep() -> None:
    owner = User.objects.create(username="broker_recovery_owner", email="broker@example.test")
    old = timezone.now() - timedelta(minutes=6)
    jobs = [
        ExportJob.objects.create(
            owner=owner, kind=ExportJob.Kind.ACCOUNT_DATA, format=ExportJob.Format.ZIP
        )
        for _ in range(2)
    ]
    asset = MediaAsset.objects.create(
        owner=owner,
        kind=MediaAsset.Kind.CELL_IMAGE,
        storage_key="test/broker-recovery",
        status=MediaAsset.Status.UPLOADED,
    )
    ExportJob.objects.filter(pk__in=[job.pk for job in jobs]).update(updated_at=old)
    MediaAsset.objects.filter(pk=asset.pk).update(updated_at=old)

    def publish_export(job_id):
        if job_id == jobs[0].pk:
            raise BrokerOperationalError("transport unavailable")

    with (
        patch("apps.exports.tasks.process_export_job.delay", side_effect=publish_export) as enqueue,
        patch("apps.media_assets.tasks.process_media_asset.delay") as media_enqueue,
    ):
        assert recover_stalled_jobs.run() == {"exports": 2, "media": 1, "failed": 0}
    assert enqueue.call_args_list == [call(jobs[0].pk), call(jobs[1].pk)]
    media_enqueue.assert_called_once_with(asset.pk)
    for job in jobs:
        job.refresh_from_db()
        assert job.status == ExportJob.Status.QUEUED
        assert job.attempt_count == 0
    assert jobs[0].updated_at == old
    assert jobs[1].updated_at > old
    asset.refresh_from_db()
    assert asset.updated_at > old

    with (
        patch("apps.exports.tasks.process_export_job.delay") as retry_enqueue,
        patch("apps.media_assets.tasks.process_media_asset.delay") as retry_media_enqueue,
    ):
        assert recover_stalled_jobs.run() == {"exports": 1, "media": 0, "failed": 0}
    retry_enqueue.assert_called_once_with(jobs[0].pk)
    retry_media_enqueue.assert_not_called()
    jobs[0].refresh_from_db()
    assert jobs[0].updated_at > old


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("kind", ["export", "media"])
@pytest.mark.parametrize("worker_still_processing", [True, False])
def test_failed_ambiguous_publication_does_not_rewind_a_worker_update(
    kind: str, worker_still_processing: bool
) -> None:
    owner = User.objects.create(username="claimed_recovery_owner", email="claimed@example.test")
    old = timezone.now() - timedelta(seconds=settings.CELERY_TASK_TIME_LIMIT + 120)
    if kind == "export":
        model = ExportJob
        item = ExportJob.objects.create(
            owner=owner,
            kind=ExportJob.Kind.ACCOUNT_DATA,
            format=ExportJob.Format.ZIP,
            status=ExportJob.Status.PROCESSING,
        )
        field = "attempt_count"
        pending_status = ExportJob.Status.QUEUED
        task = process_export_job
        category = "exports"
    else:
        model = MediaAsset
        item = MediaAsset.objects.create(
            owner=owner,
            kind=MediaAsset.Kind.CELL_IMAGE,
            storage_key="test/ambiguous-publication",
            status=MediaAsset.Status.PROCESSING,
        )
        field = "processing_attempt_count"
        pending_status = MediaAsset.Status.UPLOADED
        task = process_media_asset
        category = "media"
    model.objects.filter(pk=item.pk).update(updated_at=old)
    worker_updated_at = timezone.now() + timedelta(seconds=1)
    worker_status = "processing" if worker_still_processing else pending_status

    def delivered_despite_error(item_id):
        model.objects.filter(pk=item_id).update(
            status=worker_status, updated_at=worker_updated_at, **{field: 1}
        )
        raise BrokerOperationalError("ambiguous transport failure")

    with patch.object(task, "delay", side_effect=delivered_despite_error):
        expected = {"exports": 0, "media": 0, "failed": 0}
        expected[category] = 1
        assert recover_stalled_jobs.run() == expected
    item.refresh_from_db()
    assert item.status == worker_status
    assert item.updated_at == worker_updated_at
    assert getattr(item, field) == 1
    with patch.object(task, "delay") as enqueue:
        assert recover_stalled_jobs.run() == {"exports": 0, "media": 0, "failed": 0}
    enqueue.assert_not_called()


@pytest.mark.django_db
def test_storage_retry_exhaustion_finishes_export_and_media_safely() -> None:
    owner = User.objects.create(username="storage_failure_owner", email="failure@example.test")
    job = ExportJob.objects.create(
        owner=owner,
        kind=ExportJob.Kind.ACCOUNT_DATA,
        format=ExportJob.Format.ZIP,
        attempt_count=4,
    )
    with patch("apps.exports.tasks.build_account_export", side_effect=OSError("unavailable")):
        with pytest.raises(RuntimeError, match="storage_unavailable"):
            process_export_job.run(job.pk)
    job.refresh_from_db()
    assert job.status == ExportJob.Status.FAILED
    assert job.completed_at is not None
    asset = MediaAsset.objects.create(
        owner=owner,
        kind=MediaAsset.Kind.CELL_IMAGE,
        storage_key="test/storage-failed",
        status=MediaAsset.Status.UPLOADED,
        processing_attempt_count=4,
    )
    with patch("apps.media_assets.tasks.inspect_asset", side_effect=OSError("unavailable")):
        with pytest.raises(RuntimeError, match="storage_unavailable"):
            process_media_asset.run(asset.pk)
    asset.refresh_from_db()
    assert asset.status == MediaAsset.Status.REJECTED
    assert asset.rejection_reason == "storage_unavailable"
    assert asset.processing_task_id == ""
