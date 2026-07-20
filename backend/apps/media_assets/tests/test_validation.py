from __future__ import annotations

import io

import pytest
from django.test import override_settings
from PIL import Image

from apps.media_assets.validators import (
    AssetValidationError,
    inspect_image,
    normalize_image_bytes,
    validate_upload_declaration,
)


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (48, 32), "#ffffff").save(output, format="PNG")
    return output.getvalue()


@override_settings(
    MAX_UPLOAD_BYTES=1024 * 1024,
    ALLOWED_IMAGE_MIME_TYPES={"image/png"},
)
def test_inspect_image_uses_real_signature_and_dimensions() -> None:
    data = _png_bytes()
    validated = inspect_image(
        data,
        declared_mime="image/png",
        expected_size=len(data),
    )
    assert validated.mime == "image/png"
    assert (validated.width, validated.height) == (48, 32)
    assert len(validated.checksum_sha256) == 64


@override_settings(
    MAX_UPLOAD_BYTES=1024 * 1024,
    ALLOWED_IMAGE_MIME_TYPES={"image/png", "image/jpeg"},
)
def test_upload_declaration_rejects_extension_mime_mismatch() -> None:
    with pytest.raises(AssetValidationError, match="extension_mime_mismatch"):
        validate_upload_declaration(
            filename="cover.jpg",
            content_type="image/png",
            size_bytes=128,
        )


@override_settings(MAX_UPLOAD_BYTES=1024 * 1024)
def test_inspect_image_rejects_declared_size_mismatch() -> None:
    data = _png_bytes()
    with pytest.raises(AssetValidationError, match="size_mismatch"):
        inspect_image(
            data,
            declared_mime="image/png",
            expected_size=len(data) + 1,
        )


def test_normalize_image_removes_metadata_and_uses_safe_webp() -> None:
    source = io.BytesIO()
    exif = Image.Exif()
    exif[0x010E] = "sensitive user metadata"
    Image.new("RGB", (20, 12), "#123456").save(source, format="JPEG", exif=exif)

    normalized = normalize_image_bytes(source.getvalue())

    with Image.open(io.BytesIO(normalized)) as image:
        assert image.format == "WEBP"
        assert image.size == (20, 12)
        assert not image.getexif()
        assert "icc_profile" not in image.info
        assert "xmp" not in image.info
