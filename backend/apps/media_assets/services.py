from __future__ import annotations

import io
import os
import secrets
import uuid
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import boto3
from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageOps

from apps.media_assets.models import MediaAsset
from apps.media_assets.validators import (
    AssetValidationError,
    ValidatedImage,
    inspect_image,
    validate_upload_declaration,
)

UPLOAD_INTENT_TTL = timedelta(seconds=int(settings.MEDIA_UPLOAD_URL_TTL_SECONDS))
ORPHAN_GRACE_PERIOD = timedelta(hours=int(settings.MEDIA_ORPHAN_RETENTION_HOURS))
KIND_LIMIT_SETTINGS: dict[str, tuple[str, int]] = {
    MediaAsset.Kind.AVATAR: ("MEDIA_AVATAR_MAX_BYTES", 5 * 1024 * 1024),
    MediaAsset.Kind.COVER: ("MEDIA_COVER_MAX_BYTES", 8 * 1024 * 1024),
    MediaAsset.Kind.BOARD_BACKGROUND: (
        "MEDIA_BACKGROUND_MAX_BYTES",
        12 * 1024 * 1024,
    ),
    MediaAsset.Kind.CELL_IMAGE: ("MEDIA_CELL_MAX_BYTES", 5 * 1024 * 1024),
}


def _storage_key(*, owner_public_id: uuid.UUID, kind: str, extension: str) -> str:
    today = timezone.now().strftime("%Y/%m/%d")
    random_name = secrets.token_hex(24)
    return f"staging/uploads/{owner_public_id}/{kind}/{today}/{random_name}{extension}"


def _safe_filename(value: str) -> str:
    return Path(value).name[:255]


@transaction.atomic
def create_upload_intent(
    *,
    owner,
    kind: str,
    filename: str,
    content_type: str,
    size_bytes: int,
    checksum_sha256: str = "",
) -> MediaAsset:
    if kind not in {
        MediaAsset.Kind.AVATAR,
        MediaAsset.Kind.COVER,
        MediaAsset.Kind.BOARD_BACKGROUND,
        MediaAsset.Kind.CELL_IMAGE,
    }:
        raise AssetValidationError("unsupported_asset_kind")
    if MediaAsset.objects.filter(
        owner=owner,
        status=MediaAsset.Status.PENDING,
        expires_at__gt=timezone.now(),
    ).count() >= int(settings.MEDIA_MAX_ACTIVE_UPLOAD_INTENTS):
        raise AssetValidationError("too_many_active_uploads")
    setting_name, kind_default = KIND_LIMIT_SETTINGS[kind]
    kind_limit = int(getattr(settings, setting_name, kind_default))
    global_limit = int(settings.MAX_UPLOAD_BYTES)
    mime, extension = validate_upload_declaration(
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        checksum_sha256=checksum_sha256,
        max_bytes=min(kind_limit, global_limit),
    )
    key = _storage_key(owner_public_id=owner.public_id, kind=kind, extension=extension)
    return MediaAsset.objects.create(
        owner=owner,
        kind=kind,
        status=MediaAsset.Status.PENDING,
        storage_key=key,
        storage_bucket=getattr(settings, "AWS_STORAGE_BUCKET_NAME", ""),
        original_filename=_safe_filename(filename),
        extension=extension,
        declared_mime=mime,
        expected_size=size_bytes,
        expected_checksum_sha256=checksum_sha256.strip().lower(),
        expires_at=timezone.now() + UPLOAD_INTENT_TTL,
    )


def build_upload_instructions(asset: MediaAsset) -> dict:
    if getattr(settings, "USE_S3", False):
        client = boto3.client(
            "s3",
            endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None),
            region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
            aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
            aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
        )
        signed = client.generate_presigned_post(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=asset.storage_key,
            Fields={"Content-Type": asset.declared_mime},
            Conditions=[
                {"Content-Type": asset.declared_mime},
                ["content-length-range", asset.expected_size, asset.expected_size],
            ],
            ExpiresIn=int(UPLOAD_INTENT_TTL.total_seconds()),
        )
        public_endpoint = getattr(settings, "S3_PUBLIC_ENDPOINT_URL", "") or os.environ.get(
            "S3_PUBLIC_ENDPOINT_URL",
            "",
        )
        if public_endpoint:
            internal = urlsplit(signed["url"])
            public = urlsplit(public_endpoint)
            if public.scheme not in {"http", "https"} or not public.netloc:
                raise RuntimeError("S3_PUBLIC_ENDPOINT_URL must be an absolute HTTP(S) origin.")
            # Presigned POST policy fields and object path remain byte-for-byte intact.
            # Only the Docker-internal origin is replaced for the browser.
            signed["url"] = urlunsplit(
                (
                    public.scheme,
                    public.netloc,
                    f"{public.path.rstrip('/')}{internal.path}",
                    internal.query,
                    internal.fragment,
                )
            )
        return {
            "method": "POST",
            "url": signed["url"],
            "fields": signed["fields"],
            "headers": {},
            "expires_at": asset.expires_at,
        }
    return {
        "method": "PUT",
        "url": f"/api/v1/uploads/{asset.public_id}/content/",
        "headers": {"Content-Type": asset.declared_mime},
        "fields": {},
        "expires_at": asset.expires_at,
    }


@transaction.atomic
def store_direct_upload(*, asset: MediaAsset, owner, uploaded_file) -> MediaAsset:
    locked = MediaAsset.objects.select_for_update().get(pk=asset.pk, owner=owner)
    if locked.status != MediaAsset.Status.PENDING or (
        locked.expires_at and locked.expires_at <= timezone.now()
    ):
        raise AssetValidationError("upload_intent_expired")
    content_type = (getattr(uploaded_file, "content_type", "") or "").split(";", 1)[0].lower()
    if content_type != locked.declared_mime:
        raise AssetValidationError("declared_mime_mismatch")
    if int(getattr(uploaded_file, "size", 0)) != locked.expected_size:
        raise AssetValidationError("size_mismatch")
    stored_name = default_storage.save(locked.storage_key, uploaded_file)
    if stored_name != locked.storage_key:
        locked.storage_key = stored_name
    locked.uploaded_at = timezone.now()
    locked.status = MediaAsset.Status.UPLOADED
    locked.save(update_fields=("storage_key", "uploaded_at", "status", "updated_at"))
    return locked


@transaction.atomic
def complete_upload(*, asset: MediaAsset, owner) -> MediaAsset:
    locked = MediaAsset.objects.select_for_update().get(pk=asset.pk, owner=owner)
    if locked.status in {MediaAsset.Status.PROCESSING, MediaAsset.Status.READY}:
        return locked
    if locked.status not in {MediaAsset.Status.PENDING, MediaAsset.Status.UPLOADED}:
        raise AssetValidationError("upload_cannot_be_completed")
    if locked.expires_at and locked.expires_at <= timezone.now():
        raise AssetValidationError("upload_intent_expired")
    if not default_storage.exists(locked.storage_key):
        raise AssetValidationError("uploaded_object_not_found")
    if default_storage.size(locked.storage_key) != locked.expected_size:
        raise AssetValidationError("size_mismatch")
    task_id = uuid.uuid4().hex
    locked.status = MediaAsset.Status.PROCESSING
    locked.processing_task_id = task_id
    locked.uploaded_at = locked.uploaded_at or timezone.now()
    locked.save(update_fields=("status", "processing_task_id", "uploaded_at", "updated_at"))
    from apps.media_assets.tasks import process_media_asset

    transaction.on_commit(
        lambda: process_media_asset.apply_async(args=(locked.pk,), task_id=task_id)
    )
    return locked


def read_asset_bytes(asset: MediaAsset) -> bytes:
    maximum = int(settings.MAX_UPLOAD_BYTES)
    with default_storage.open(asset.storage_key, "rb") as source:
        data = source.read(maximum + 1)
    if len(data) > maximum:
        raise AssetValidationError("file_size_out_of_range")
    return data


def inspect_asset(asset: MediaAsset) -> tuple[bytes, ValidatedImage]:
    data = read_asset_bytes(asset)
    return data, inspect_image(
        data,
        declared_mime=asset.declared_mime,
        expected_size=asset.expected_size,
        expected_checksum=asset.expected_checksum_sha256,
    )


def promote_validated_asset(
    *,
    asset: MediaAsset,
    data: bytes,
    inspection: ValidatedImage,
) -> str:
    """Store normalized bytes away from the client-writable staging key.

    A presigned upload may remain usable until it expires. Published revisions
    therefore serve only this metadata-stripped, immutable worker-written key
    and never the original upload target.
    """

    final_key = (
        f"media/{asset.owner.public_id}/{asset.public_id}/"
        f"{inspection.checksum_sha256}{inspection.extension}"
    )
    if not default_storage.exists(final_key):
        stored_name = default_storage.save(final_key, ContentFile(data))
        if stored_name != final_key:
            raise RuntimeError("Immutable media key unexpectedly collided.")
    return final_key


def _thumbnail_bytes(data: bytes, *, max_size: tuple[int, int]) -> bytes:
    with Image.open(io.BytesIO(data)) as opened:
        source = ImageOps.exif_transpose(opened)
        source.thumbnail(max_size, Image.Resampling.LANCZOS)
        if source.mode not in {"RGB", "RGBA"}:
            source = source.convert("RGBA" if "transparency" in source.info else "RGB")
        output = io.BytesIO()
        source.save(output, format="WEBP", quality=82, method=6, exif=b"")
        return output.getvalue()


@transaction.atomic
def create_thumbnail(*, original: MediaAsset, data: bytes) -> MediaAsset | None:
    if original.kind not in {
        MediaAsset.Kind.COVER,
        MediaAsset.Kind.AVATAR,
        MediaAsset.Kind.BOARD_BACKGROUND,
    }:
        return None
    existing = original.derivatives.filter(
        variant=MediaAsset.Variant.THUMBNAIL,
        status=MediaAsset.Status.READY,
    ).first()
    if existing:
        return existing
    maximum = (720, 450) if original.kind != MediaAsset.Kind.AVATAR else (512, 512)
    thumbnail_data = _thumbnail_bytes(data, max_size=maximum)
    key = f"media/derived/{original.public_id}/thumbnail.webp"
    if default_storage.exists(key):
        default_storage.delete(key)
    default_storage.save(key, ContentFile(thumbnail_data))
    with Image.open(io.BytesIO(thumbnail_data)) as image:
        width, height = image.size
    import hashlib

    return MediaAsset.objects.create(
        owner=original.owner,
        kind=original.kind,
        status=MediaAsset.Status.READY,
        variant=MediaAsset.Variant.THUMBNAIL,
        parent=original,
        storage_key=key,
        storage_bucket=original.storage_bucket,
        extension=".webp",
        declared_mime="image/webp",
        detected_mime="image/webp",
        expected_size=len(thumbnail_data),
        byte_size=len(thumbnail_data),
        checksum_sha256=hashlib.sha256(thumbnail_data).hexdigest(),
        width=width,
        height=height,
        ready_at=timezone.now(),
    )


@transaction.atomic
def create_generated_asset(
    *,
    owner,
    kind: str,
    data: bytes,
    extension: str,
    mime: str,
    storage_prefix: str,
    expires_at=None,
) -> MediaAsset:
    key = f"{storage_prefix}/{owner.public_id}/{secrets.token_hex(24)}{extension}"
    stored_name = default_storage.save(key, ContentFile(data))
    import hashlib

    return MediaAsset.objects.create(
        owner=owner,
        kind=kind,
        status=MediaAsset.Status.READY,
        variant=MediaAsset.Variant.GENERATED,
        storage_key=stored_name,
        storage_bucket=getattr(settings, "AWS_STORAGE_BUCKET_NAME", ""),
        extension=extension,
        declared_mime=mime,
        detected_mime=mime,
        expected_size=len(data),
        byte_size=len(data),
        checksum_sha256=hashlib.sha256(data).hexdigest(),
        ready_at=timezone.now(),
        expires_at=expires_at,
    )


def asset_is_referenced(asset: MediaAsset) -> bool:
    reverse_accessors = (
        "profile_avatars",
        "bingo_covers",
        "bingo_backgrounds",
        "revision_covers",
        "revision_backgrounds",
        "revision_cells",
        "export_jobs",
        "draft_references",
    )
    for accessor in reverse_accessors:
        manager = getattr(asset, accessor, None)
        if manager is not None and manager.exists():
            return True
    parent = asset.parent
    return bool(parent and asset_is_referenced(parent))


def asset_is_publicly_accessible(asset: MediaAsset) -> bool:
    if asset.kind in {MediaAsset.Kind.BINGO_EXPORT, MediaAsset.Kind.ACCOUNT_EXPORT}:
        return False
    if asset.parent_id:
        parent = asset.parent
        return bool(parent and asset_is_publicly_accessible(parent))
    if (
        getattr(asset, "profile_avatars", None) is not None
        and asset.profile_avatars.filter(
            user__is_active=True,
            user__suspended_at__isnull=True,
            user__deleted_at__isnull=True,
        ).exists()
    ):
        return True
    Bingo = apps.get_model("bingos", "Bingo")
    public_bingos = Bingo.objects.filter(
        status=Bingo.Status.PUBLISHED,
        visibility__in=(Bingo.Visibility.PUBLIC, Bingo.Visibility.UNLISTED),
        hidden_at__isnull=True,
        deleted_at__isnull=True,
    )
    from django.db.models import Q

    if public_bingos.filter(
        Q(cover=asset)
        | Q(background=asset)
        | Q(current_revision__cover=asset)
        | Q(current_revision__background=asset)
        | Q(current_revision__cells__image=asset)
    ).exists():
        return True
    try:
        SharedResult = apps.get_model("plays", "SharedResult")
    except LookupError:
        return False
    return (
        SharedResult.objects.filter(
            access=SharedResult.Access.PUBLIC,
            hidden_at__isnull=True,
            revoked_at__isnull=True,
            bingo__hidden_at__isnull=True,
        )
        .filter(
            Q(revision__cover=asset)
            | Q(revision__background=asset)
            | Q(revision__cells__image=asset)
        )
        .exists()
    )


@transaction.atomic
def delete_unreferenced_asset(*, asset: MediaAsset, owner=None) -> bool:
    filters = {"pk": asset.pk}
    if owner is not None:
        filters["owner"] = owner
    locked = MediaAsset.objects.select_for_update().get(**filters)
    if asset_is_referenced(locked):
        return False
    for derivative in locked.derivatives.all():
        if default_storage.exists(derivative.storage_key):
            default_storage.delete(derivative.storage_key)
        derivative.status = MediaAsset.Status.DELETED
        derivative.deleted_at = timezone.now()
        derivative.save(update_fields=("status", "deleted_at", "updated_at"))
    if default_storage.exists(locked.storage_key):
        default_storage.delete(locked.storage_key)
    locked.status = MediaAsset.Status.DELETED
    locked.deleted_at = timezone.now()
    locked.save(update_fields=("status", "deleted_at", "updated_at"))
    return True
