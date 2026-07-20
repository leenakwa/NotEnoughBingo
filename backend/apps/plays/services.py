from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.analytics.models import InteractionEvent
from apps.analytics.services import record_server_event
from apps.bingos.models import Bingo, BingoRevision
from apps.common.models import IdempotencyRecord
from apps.plays.exceptions import ProgressVersionConflict, ShareIdempotencyConflict
from apps.plays.models import PlayProgress, SharedResult

SHARE_IDEMPOTENCY_TTL = timedelta(hours=24)


def normalize_selected_cells(value, *, revision: BingoRevision) -> list[str]:
    if not isinstance(value, list):
        raise ValidationError({"selected_cells": ["Expected a list of cell ids."]})
    if len(value) > revision.size * revision.size:
        raise ValidationError({"selected_cells": ["Too many selected cells."]})
    cells = list(revision.cells.values_list("public_id", "position"))
    by_id = {str(public_id): position for public_id, position in cells}
    by_position = {position: str(public_id) for public_id, position in cells}
    normalized: list[str] = []
    seen: set[str] = set()
    for supplied in value:
        if isinstance(supplied, bool):
            raise ValidationError({"selected_cells": ["Every selection must identify a cell."]})
        if isinstance(supplied, int):
            cell_id = by_position.get(supplied)
        else:
            cell_id = str(supplied).lower()
            if cell_id not in by_id:
                cell_id = None
        if not cell_id:
            raise ValidationError(
                {"selected_cells": ["One or more cells are not in this revision."]}
            )
        if cell_id in seen:
            raise ValidationError({"selected_cells": ["Selected cells must be unique."]})
        seen.add(cell_id)
        normalized.append(cell_id)
    return sorted(normalized, key=by_id.__getitem__)


def accessible_play_bingo(*, bingo_id, user=None) -> Bingo:
    queryset = (
        Bingo.objects.accessible_to(user)
        .filter(
            public_id=bingo_id,
            status=Bingo.Status.PUBLISHED,
            current_revision__isnull=False,
            hidden_at__isnull=True,
        )
        .select_related("current_revision", "author")
    )
    bingo = queryset.first()
    if not bingo:
        raise Bingo.DoesNotExist
    return bingo


def _revision_for_play(*, bingo: Bingo, revision_id=None, existing=None) -> BingoRevision:
    if revision_id is None:
        revision = bingo.current_revision
        if revision is None:
            raise ValidationError({"revision_id": ["This bingo has no published revision."]})
        return revision
    try:
        revision = BingoRevision.objects.get(public_id=revision_id, bingo=bingo)
    except BingoRevision.DoesNotExist as exc:
        raise ValidationError({"revision_id": ["This revision is unavailable."]}) from exc
    is_current = revision.pk == bingo.current_revision_id
    is_existing = existing and existing.revision_id == revision.pk
    if not is_current and not is_existing:
        raise ValidationError(
            {"revision_id": ["Only the current or already-started revision can be updated."]}
        )
    return revision


@transaction.atomic
def replace_progress(
    *,
    user,
    bingo: Bingo,
    selected_cells: list[str],
    expected_version: int | None,
    revision_id=None,
) -> PlayProgress:
    locked_bingo = Bingo.objects.select_for_update().get(pk=bingo.pk)
    existing = (
        PlayProgress.objects.select_for_update().filter(user=user, bingo=locked_bingo).first()
    )
    current_version = existing.version if existing else 0
    if expected_version is not None and current_version != expected_version:
        error = ProgressVersionConflict()
        error.detail = cast(
            Any,
            {
                "message": str(error.default_detail),
                "current_version": current_version,
            },
        )
        raise error
    revision = _revision_for_play(
        bingo=locked_bingo,
        revision_id=revision_id,
        existing=existing,
    )
    selected = normalize_selected_cells(selected_cells, revision=revision)
    if existing:
        existing.revision = revision
        existing.selected_cells = selected
        existing.version += 1
        existing.reset_at = None
        existing.save(
            update_fields=("revision", "selected_cells", "version", "reset_at", "updated_at")
        )
        return existing
    progress = PlayProgress.objects.create(
        user=user,
        bingo=locked_bingo,
        revision=revision,
        selected_cells=selected,
        version=1,
    )
    Bingo.objects.filter(pk=locked_bingo.pk).update(play_count=F("play_count") + 1)
    return progress


@transaction.atomic
def reset_progress(*, user, bingo: Bingo) -> bool:
    progress = PlayProgress.objects.select_for_update().filter(user=user, bingo=bingo).first()
    if not progress:
        return False
    progress.selected_cells = []
    progress.version += 1
    progress.reset_at = timezone.now()
    progress.save(update_fields=("selected_cells", "version", "reset_at", "updated_at"))
    return True


def guest_session_digest(session_key: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(),
        f"guest-share:{session_key}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _share_request_hash(
    *,
    bingo: Bingo,
    revision: BingoRevision,
    selected_cells: list[str],
    display_name: str,
) -> str:
    value = {
        "bingo": str(bingo.public_id),
        "revision": str(revision.public_id),
        "selected_cells": selected_cells,
        "display_name": display_name,
    }
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _share_idempotency_scope(*, actor, guest_hash: str) -> str:
    return f"share:user:{actor.pk}" if actor else f"share:guest:{guest_hash}"


@transaction.atomic
def create_shared_result(
    *,
    bingo: Bingo,
    selected_cells: list[str],
    display_name: str,
    idempotency_key: str,
    actor=None,
    guest_hash: str = "",
    revision_id=None,
) -> SharedResult:
    locked_bingo = Bingo.objects.select_for_update().get(pk=bingo.pk)
    if locked_bingo.hidden_at or locked_bingo.current_revision_id is None:
        raise PermissionDenied("This bingo is unavailable.")
    if locked_bingo.visibility == Bingo.Visibility.PRIVATE and (
        not actor or actor.pk != locked_bingo.author_id
    ):
        raise PermissionDenied("This bingo is unavailable.")
    if revision_id:
        try:
            revision = BingoRevision.objects.get(public_id=revision_id, bingo=locked_bingo)
        except BingoRevision.DoesNotExist as exc:
            raise ValidationError({"revision_id": ["This revision is unavailable."]}) from exc
    else:
        revision = locked_bingo.current_revision
    if revision.visibility == Bingo.Visibility.PRIVATE and (
        not actor or actor.pk != locked_bingo.author_id
    ):
        raise PermissionDenied("This bingo is unavailable.")
    selected = normalize_selected_cells(selected_cells, revision=revision)
    normalized_name = " ".join(display_name.strip().split())
    if not normalized_name or len(normalized_name) > 80:
        raise ValidationError({"display_name": ["Use a display name of 1 to 80 characters."]})
    if actor:
        guest_hash = ""
    elif not guest_hash:
        raise ValidationError({"guest": ["A browser session is required."]})
    access = (
        SharedResult.Access.OWNER_ONLY
        if (
            locked_bingo.visibility == Bingo.Visibility.PRIVATE
            or revision.visibility == Bingo.Visibility.PRIVATE
        )
        else SharedResult.Access.PUBLIC
    )
    request_hash = _share_request_hash(
        bingo=locked_bingo,
        revision=revision,
        selected_cells=selected,
        display_name=normalized_name,
    )
    scope = _share_idempotency_scope(actor=actor, guest_hash=guest_hash)
    existing_record = IdempotencyRecord.objects.filter(
        key=idempotency_key,
        scope=scope,
    ).first()
    if existing_record and existing_record.expires_at > timezone.now():
        if existing_record.request_hash != request_hash:
            raise ShareIdempotencyConflict()
        existing_share_id = (existing_record.response_body or {}).get("share_id")
        return SharedResult.objects.get(share_id=existing_share_id, bingo=locked_bingo)
    if existing_record:
        existing_record.delete()
    result = SharedResult.objects.create(
        bingo=locked_bingo,
        revision=revision,
        owner=actor,
        owner_display_name=normalized_name,
        guest_session_hash=guest_hash,
        selected_cells=selected,
        access=access,
    )
    record_server_event(
        event_type=InteractionEvent.Type.SHARE,
        actor=actor,
        anonymous_id_hash=guest_hash,
        bingo=locked_bingo,
        revision=revision,
        metadata={"shared_result_id": str(result.public_id)},
    )
    Bingo.objects.filter(pk=locked_bingo.pk).update(share_count=F("share_count") + 1)
    IdempotencyRecord.objects.create(
        key=idempotency_key,
        scope=scope,
        method="POST",
        path=f"/api/v1/bingos/{locked_bingo.public_id}/shares/",
        request_hash=request_hash,
        response_status=201,
        response_body={"share_id": result.share_id},
        expires_at=timezone.now() + SHARE_IDEMPOTENCY_TTL,
    )
    return result


def can_view_shared_result(*, result: SharedResult, user) -> bool:
    if result.revoked_at or result.hidden_at or result.bingo.hidden_at:
        return bool(
            user and user.is_authenticated and user.has_perm("moderation.view_private_content")
        )
    authenticated = bool(user and user.is_authenticated)
    privileged = authenticated and (
        user.has_perm("moderation.view_private_content")
        or user.pk == result.owner_id
        or user.pk == result.bingo.author_id
    )
    if (
        result.access == SharedResult.Access.OWNER_ONLY
        or result.revision.visibility == Bingo.Visibility.PRIVATE
    ):
        return privileged
    return True
