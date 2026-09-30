from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.db import connection
from django.utils import timezone

from apps.accounts.models import User
from apps.common.jobs import job_lock_key, periodic_task
from apps.common.tasks import recover_stalled_jobs
from apps.exports.models import ExportJob
from apps.exports.tasks import process_export_job
from apps.media_assets.models import MediaAsset
from apps.media_assets.tasks import process_media_asset


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
