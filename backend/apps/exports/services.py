from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.bingos.models import Bingo
from apps.exports.models import ExportJob

BINGO_EXPORT_RETENTION = timedelta(days=7)


@transaction.atomic
def request_bingo_export(
    *,
    user,
    bingo: Bingo,
    output_format: str,
    idempotency_key: str,
) -> ExportJob:
    locked = Bingo.objects.select_for_update().select_related("current_revision").get(pk=bingo.pk)
    if locked.author_id != user.pk:
        raise PermissionDenied("Only the bingo author can export this board.")
    if locked.current_revision_id is None:
        raise ValidationError({"bingo": ["Publish the bingo before exporting it."]})
    if output_format not in {ExportJob.Format.PNG, ExportJob.Format.PDF}:
        raise ValidationError({"format": ["Choose PNG or PDF."]})
    existing = ExportJob.objects.filter(
        owner=user,
        kind=ExportJob.Kind.BINGO,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        if (
            existing.bingo_id != locked.pk
            or existing.revision_id != locked.current_revision_id
            or existing.format != output_format
        ):
            raise ValidationError(
                {"idempotency_key": ["This key was already used for another export."]}
            )
        return existing
    job = ExportJob.objects.create(
        owner=user,
        kind=ExportJob.Kind.BINGO,
        format=output_format,
        bingo=locked,
        revision=locked.current_revision,
        idempotency_key=idempotency_key,
        expires_at=timezone.now() + BINGO_EXPORT_RETENTION,
    )
    from apps.exports.tasks import process_export_job

    transaction.on_commit(lambda: process_export_job.delay(job.pk))
    return job


@transaction.atomic
def request_account_export(user) -> ExportJob:
    now = timezone.now()
    existing = (
        ExportJob.objects.filter(
            owner=user,
            kind=ExportJob.Kind.ACCOUNT_DATA,
            status__in=(
                ExportJob.Status.QUEUED,
                ExportJob.Status.PROCESSING,
                ExportJob.Status.READY,
            ),
        )
        .filter(expires_at__gt=now)
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing
    job = ExportJob.objects.create(
        owner=user,
        kind=ExportJob.Kind.ACCOUNT_DATA,
        format=ExportJob.Format.ZIP,
        expires_at=now
        + timedelta(hours=int(getattr(settings, "ACCOUNT_EXPORT_RETENTION_HOURS", 24))),
    )
    from apps.exports.tasks import process_export_job

    transaction.on_commit(lambda: process_export_job.delay(job.pk))
    return job
