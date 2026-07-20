from __future__ import annotations

import hashlib
import json
from datetime import timedelta
from typing import Any, cast

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.bingos.exceptions import DraftVersionConflict, IdempotencyConflict
from apps.bingos.models import (
    Bingo,
    BingoCell,
    BingoRevision,
    BingoRevisionTag,
    BingoTag,
    Draft,
    DraftMediaAsset,
    Tag,
)
from apps.bingos.validators import empty_draft_document, normalize_draft_document
from apps.common.models import IdempotencyRecord
from apps.media_assets.models import MediaAsset

IDEMPOTENCY_TTL = timedelta(hours=24)


def canonical_document_hash(document: dict) -> str:
    encoded = json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _resolve_asset(*, asset_id: str | None, owner, expected_kind: str, field: str):
    if asset_id is None:
        return None
    try:
        return MediaAsset.objects.get(
            public_id=asset_id,
            owner=owner,
            kind=expected_kind,
            status=MediaAsset.Status.READY,
            deleted_at__isnull=True,
        )
    except MediaAsset.DoesNotExist as exc:
        raise ValidationError({field: ["The selected media asset is unavailable."]}) from exc


def resolve_document_assets(*, document: dict, owner) -> dict:
    cover = _resolve_asset(
        asset_id=document["cover_asset_id"],
        owner=owner,
        expected_kind=MediaAsset.Kind.COVER,
        field="cover_asset_id",
    )
    background = _resolve_asset(
        asset_id=document["background_asset_id"],
        owner=owner,
        expected_kind=MediaAsset.Kind.BOARD_BACKGROUND,
        field="background_asset_id",
    )
    cell_ids = {
        cell["image_asset_id"] for cell in document["cells"] if cell["image_asset_id"] is not None
    }
    cell_assets = {
        str(asset.public_id): asset
        for asset in MediaAsset.objects.filter(
            public_id__in=cell_ids,
            owner=owner,
            kind=MediaAsset.Kind.CELL_IMAGE,
            status=MediaAsset.Status.READY,
            deleted_at__isnull=True,
        )
    }
    if len(cell_assets) != len(cell_ids):
        raise ValidationError({"cells": ["One or more cell images are unavailable."]})
    return {"cover": cover, "background": background, "cells": cell_assets}


def _sync_draft_media(*, draft: Draft, assets: dict) -> None:
    asset_ids = {
        asset.pk
        for asset in (
            assets["cover"],
            assets["background"],
            *assets["cells"].values(),
        )
        if asset is not None
    }
    DraftMediaAsset.objects.filter(draft=draft).exclude(asset_id__in=asset_ids).delete()
    existing_ids = set(
        DraftMediaAsset.objects.filter(draft=draft, asset_id__in=asset_ids).values_list(
            "asset_id",
            flat=True,
        )
    )
    DraftMediaAsset.objects.bulk_create(
        [DraftMediaAsset(draft=draft, asset_id=asset_id) for asset_id in asset_ids - existing_ids]
    )


@transaction.atomic
def create_bingo(*, author, document: dict | None = None) -> Bingo:
    normalized = normalize_draft_document(document or empty_draft_document())
    assets = resolve_document_assets(document=normalized, owner=author)
    bingo = Bingo.objects.create(
        author=author,
        title=normalized["title"],
        description=normalized["description"],
        size=normalized["size"],
        visibility=normalized["visibility"],
        marking_style=normalized["marking_style"],
        marking_config=normalized["marking_config"],
        cover=assets["cover"],
        background=assets["background"],
    )
    draft = Draft.objects.create(
        bingo=bingo,
        document=normalized,
        schema_version=normalized["schema_version"],
        version=1,
        saved_by=author,
    )
    _sync_draft_media(draft=draft, assets=assets)
    return bingo


@transaction.atomic
def save_draft(
    *,
    bingo: Bingo,
    actor,
    document: dict,
    expected_version: int,
) -> Draft:
    locked_bingo = Bingo.objects.select_for_update().get(pk=bingo.pk, author=actor)
    draft = Draft.objects.select_for_update().get(bingo=locked_bingo)
    if draft.version != expected_version:
        error = DraftVersionConflict()
        error.detail = cast(
            Any,
            {
                "message": str(error.default_detail),
                "current_version": draft.version,
                "etag": f'"draft-{draft.version}"',
            },
        )
        raise error
    normalized = normalize_draft_document(document)
    assets = resolve_document_assets(document=normalized, owner=actor)
    draft.document = normalized
    draft.schema_version = normalized["schema_version"]
    draft.version += 1
    draft.saved_by = actor
    draft.save(
        update_fields=(
            "document",
            "schema_version",
            "version",
            "saved_by",
            "updated_at",
        )
    )
    locked_bingo.title = normalized["title"]
    locked_bingo.description = normalized["description"]
    locked_bingo.size = normalized["size"]
    locked_bingo.visibility = normalized["visibility"]
    locked_bingo.marking_style = normalized["marking_style"]
    locked_bingo.marking_config = normalized["marking_config"]
    locked_bingo.cover = assets["cover"]
    locked_bingo.background = assets["background"]
    locked_bingo.save(
        update_fields=(
            "title",
            "description",
            "size",
            "visibility",
            "marking_style",
            "marking_config",
            "cover",
            "background",
            "updated_at",
        )
    )
    _sync_draft_media(draft=draft, assets=assets)
    return draft


def _tag_for_name(name: str) -> Tag:
    slug = slugify(name, allow_unicode=True)[:60]
    tag, _ = Tag.objects.get_or_create(slug=slug, defaults={"name": name})
    if tag.hidden_at is not None:
        raise ValidationError({"tags": [f'The tag "{name}" is unavailable.']})
    return tag


def _replace_current_tags(*, bingo: Bingo, tags: list[Tag]) -> None:
    previous_ids = list(bingo.tag_links.values_list("tag_id", flat=True))
    BingoTag.objects.filter(bingo=bingo).delete()
    BingoTag.objects.bulk_create(
        [BingoTag(bingo=bingo, tag=tag, position=index) for index, tag in enumerate(tags)]
    )
    affected_ids = set(previous_ids) | {tag.pk for tag in tags}
    for tag in Tag.objects.filter(pk__in=affected_ids):
        Tag.objects.filter(pk=tag.pk).update(usage_count=tag.bingo_links.count())


def _idempotency_lookup(*, key: str, actor, bingo: Bingo) -> BingoRevision | None:
    scope = f"bingo-publish:{actor.pk}:{bingo.public_id}"
    request_hash = hashlib.sha256(f"publish:{bingo.public_id}".encode()).hexdigest()
    existing = IdempotencyRecord.objects.filter(key=key, scope=scope).first()
    if not existing:
        return None
    if existing.expires_at <= timezone.now():
        existing.delete()
        return None
    if existing.request_hash != request_hash:
        raise IdempotencyConflict()
    revision_id = (existing.response_body or {}).get("revision_id")
    if not revision_id:
        raise IdempotencyConflict()
    return BingoRevision.objects.get(public_id=revision_id, bingo=bingo)


def _save_idempotency(*, key: str, actor, bingo: Bingo, revision: BingoRevision) -> None:
    IdempotencyRecord.objects.create(
        key=key,
        scope=f"bingo-publish:{actor.pk}:{bingo.public_id}",
        method="POST",
        path=f"/api/v1/bingos/{bingo.public_id}/publish/",
        request_hash=hashlib.sha256(f"publish:{bingo.public_id}".encode()).hexdigest(),
        response_status=201,
        response_body={
            "revision_id": str(revision.public_id),
            "revision_number": revision.revision_number,
        },
        expires_at=timezone.now() + IDEMPOTENCY_TTL,
    )


@transaction.atomic
def publish_bingo(*, bingo: Bingo, actor, idempotency_key: str) -> BingoRevision:
    locked_bingo = (
        Bingo.objects.select_for_update()
        .select_related("current_revision")
        .get(
            pk=bingo.pk,
            author=actor,
            deleted_at__isnull=True,
        )
    )
    previous = _idempotency_lookup(key=idempotency_key, actor=actor, bingo=locked_bingo)
    if previous:
        return previous
    draft = Draft.objects.select_for_update().get(bingo=locked_bingo)
    document = normalize_draft_document(draft.document, require_publishable=True)
    assets = resolve_document_assets(document=document, owner=actor)
    revision_number = (
        locked_bingo.current_revision.revision_number + 1 if locked_bingo.current_revision_id else 1
    )
    revision = BingoRevision.objects.create(
        bingo=locked_bingo,
        revision_number=revision_number,
        title=document["title"],
        description=document["description"],
        size=document["size"],
        visibility=document["visibility"],
        marking_style=document["marking_style"],
        marking_config=document["marking_config"],
        cover=assets["cover"],
        background=assets["background"],
        schema_version=document["schema_version"],
        document_hash=canonical_document_hash(document),
        published_by=actor,
    )
    BingoCell.objects.bulk_create(
        [
            BingoCell(
                revision=revision,
                public_id=cell["id"],
                row=cell["row"],
                column=cell["column"],
                position=cell["position"],
                text=cell["text"],
                text_color=cell["text_color"],
                bold=cell["bold"],
                italic=cell["italic"],
                underline=cell["underline"],
                strikethrough=cell["strikethrough"],
                background_color=cell["background_color"],
                background_opacity=cell["background_opacity"],
                image=assets["cells"].get(cell["image_asset_id"]),
                image_opacity=cell["image_opacity"],
                border_color=cell["border_color"],
                border_width=cell["border_width"],
                border_style=cell["border_style"],
            )
            for cell in document["cells"]
        ]
    )
    tags = [_tag_for_name(name) for name in document["tags"]]
    BingoRevisionTag.objects.bulk_create(
        [
            BingoRevisionTag(
                revision=revision,
                tag=tag,
                name=tag.name,
                slug=tag.slug,
                position=index,
            )
            for index, tag in enumerate(tags)
        ]
    )
    _replace_current_tags(bingo=locked_bingo, tags=tags)
    now = timezone.now()
    locked_bingo.title = document["title"]
    locked_bingo.description = document["description"]
    locked_bingo.size = document["size"]
    locked_bingo.visibility = document["visibility"]
    locked_bingo.marking_style = document["marking_style"]
    locked_bingo.marking_config = document["marking_config"]
    locked_bingo.cover = assets["cover"]
    locked_bingo.background = assets["background"]
    locked_bingo.current_revision = revision
    locked_bingo.status = Bingo.Status.PUBLISHED
    locked_bingo.published_at = now
    locked_bingo.archived_at = None
    locked_bingo.save(
        update_fields=(
            "title",
            "description",
            "size",
            "visibility",
            "marking_style",
            "marking_config",
            "cover",
            "background",
            "current_revision",
            "status",
            "published_at",
            "archived_at",
            "updated_at",
        )
    )
    draft.based_on_revision = revision
    draft.document = document
    draft.version += 1
    draft.save(
        update_fields=(
            "based_on_revision",
            "document",
            "version",
            "updated_at",
        )
    )
    _save_idempotency(
        key=idempotency_key,
        actor=actor,
        bingo=locked_bingo,
        revision=revision,
    )
    return revision


@transaction.atomic
def archive_bingo(*, bingo: Bingo, actor) -> Bingo:
    locked = Bingo.objects.select_for_update().get(pk=bingo.pk, author=actor)
    locked.status = Bingo.Status.ARCHIVED
    locked.archived_at = timezone.now()
    locked.save(update_fields=("status", "archived_at", "updated_at"))
    return locked


@transaction.atomic
def restore_bingo(*, bingo: Bingo, actor) -> Bingo:
    locked = Bingo.objects.select_for_update().get(
        pk=bingo.pk,
        author=actor,
        deleted_at__isnull=True,
    )
    locked.status = Bingo.Status.PUBLISHED if locked.current_revision_id else Bingo.Status.DRAFT
    locked.archived_at = None
    locked.save(update_fields=("status", "archived_at", "updated_at"))
    return locked


@transaction.atomic
def soft_delete_bingo(*, bingo: Bingo, actor) -> None:
    locked = Bingo.objects.select_for_update().get(pk=bingo.pk, author=actor)
    locked.status = Bingo.Status.ARCHIVED
    locked.visibility = Bingo.Visibility.PRIVATE
    locked.archived_at = timezone.now()
    locked.deleted_at = timezone.now()
    locked.save(
        update_fields=(
            "status",
            "visibility",
            "archived_at",
            "deleted_at",
            "updated_at",
        )
    )
