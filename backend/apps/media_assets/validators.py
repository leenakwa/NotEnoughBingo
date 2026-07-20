from __future__ import annotations

import hashlib
import io
import re
import warnings
from dataclasses import dataclass
from pathlib import Path

import filetype
from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

MIME_EXTENSIONS: dict[str, set[str]] = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "image/avif": {".avif"},
}
PIL_FORMAT_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "AVIF": "image/avif",
}
CHECKSUM_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_IMAGE_DIMENSION = 12_000
MAX_IMAGE_PIXELS = 40_000_000


class AssetValidationError(ValueError):
    """A safe, client-displayable media rejection."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ValidatedImage:
    mime: str
    extension: str
    byte_size: int
    checksum_sha256: str
    width: int
    height: int


def validate_upload_declaration(
    *,
    filename: str,
    content_type: str,
    size_bytes: int,
    checksum_sha256: str = "",
    max_bytes: int | None = None,
) -> tuple[str, str]:
    normalized_mime = content_type.split(";", 1)[0].strip().lower()
    allowed = set(getattr(settings, "ALLOWED_IMAGE_MIME_TYPES", MIME_EXTENSIONS))
    if normalized_mime not in allowed or normalized_mime not in MIME_EXTENSIONS:
        raise AssetValidationError("unsupported_media_type")
    effective_limit = int(max_bytes or settings.MAX_UPLOAD_BYTES)
    if size_bytes <= 0 or size_bytes > effective_limit:
        raise AssetValidationError("file_size_out_of_range")
    suffix = Path(filename).suffix.lower()
    if suffix not in MIME_EXTENSIONS[normalized_mime]:
        raise AssetValidationError("extension_mime_mismatch")
    normalized_checksum = checksum_sha256.strip().lower()
    if normalized_checksum and not CHECKSUM_RE.fullmatch(normalized_checksum):
        raise AssetValidationError("invalid_checksum")
    return normalized_mime, suffix


def inspect_image(
    data: bytes,
    *,
    declared_mime: str,
    expected_size: int,
    expected_checksum: str = "",
) -> ValidatedImage:
    if not data or len(data) > int(settings.MAX_UPLOAD_BYTES):
        raise AssetValidationError("file_size_out_of_range")
    if len(data) != expected_size:
        raise AssetValidationError("size_mismatch")
    checksum = hashlib.sha256(data).hexdigest()
    if expected_checksum and checksum != expected_checksum:
        raise AssetValidationError("checksum_mismatch")

    kind = filetype.guess(data[:8192])
    sniffed_mime = kind.mime.lower() if kind else ""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                image_format = (probe.format or "").upper()
                width, height = probe.size
                probe.verify()
            with Image.open(io.BytesIO(data)) as decoded:
                decoded.load()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise AssetValidationError("invalid_image") from exc

    detected_mime = PIL_FORMAT_MIME.get(image_format)
    if not detected_mime or detected_mime != declared_mime:
        raise AssetValidationError("detected_mime_mismatch")
    if sniffed_mime and sniffed_mime != detected_mime:
        raise AssetValidationError("ambiguous_file_signature")
    if (
        width <= 0
        or height <= 0
        or width > MAX_IMAGE_DIMENSION
        or height > MAX_IMAGE_DIMENSION
        or width * height > MAX_IMAGE_PIXELS
    ):
        raise AssetValidationError("image_dimensions_out_of_range")
    return ValidatedImage(
        mime=detected_mime,
        extension=next(iter(MIME_EXTENSIONS[detected_mime])),
        byte_size=len(data),
        checksum_sha256=checksum,
        width=width,
        height=height,
    )


def normalize_image_bytes(data: bytes) -> bytes:
    """Return a single-frame WebP without user-controlled metadata."""

    try:
        with Image.open(io.BytesIO(data)) as opened:
            opened.seek(0)
            source = ImageOps.exif_transpose(opened)
            source.load()
            has_alpha = source.mode in {"RGBA", "LA"} or (
                source.mode == "P" and "transparency" in source.info
            )
            normalized = source.convert("RGBA" if has_alpha else "RGB")
            output = io.BytesIO()
            normalized.save(
                output,
                format="WEBP",
                quality=90,
                method=6,
                exif=b"",
                icc_profile=b"",
                xmp=b"",
            )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AssetValidationError("image_normalization_failed") from exc
    return output.getvalue()
