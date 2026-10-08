from __future__ import annotations

import copy
import io
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.files.storage import default_storage
from PIL import Image
from rest_framework.test import APIClient

from apps.bingos import validators as document_validators
from apps.bingos.models import Draft
from apps.bingos.services import create_bingo
from apps.bingos.validators import empty_draft_document, normalize_draft_document
from apps.media_assets.models import MediaAsset
from apps.media_assets.views import RawUploadParser


def _client(user) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    client.credentials(HTTP_X_CSRFTOKEN=response.data["csrf"])
    return client


def _encoded_document(document: dict) -> bytes:
    return json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (24, 16), "#ffffff").save(output, format="PNG")
    return output.getvalue()


def test_raw_upload_parser_bounds_reads_without_content_length(settings) -> None:
    settings.MAX_UPLOAD_BYTES = 1024
    body = b"x" * (settings.MAX_UPLOAD_BYTES + 100)
    stream = io.BytesIO(body)
    request = SimpleNamespace(headers={}, META={})

    with patch.object(stream, "read", wraps=stream.read) as read:
        parsed = RawUploadParser().parse(
            stream,
            media_type="image/png",
            parser_context={"request": request},
        )

    read.assert_called_once_with(settings.MAX_UPLOAD_BYTES + 1)
    assert stream.tell() == settings.MAX_UPLOAD_BYTES + 1
    assert parsed["file"].size == settings.MAX_UPLOAD_BYTES + 1
    assert parsed["file"].read() == body[: settings.MAX_UPLOAD_BYTES + 1]


@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.parametrize("extra_bytes", [1, 65_536])
def test_oversized_raw_upload_rejects_actual_body_without_mutation_or_enqueue(
    verified_user_factory, settings, django_capture_on_commit_callbacks, extra_bytes: int
) -> None:
    settings.MAX_UPLOAD_BYTES = 1024
    owner = verified_user_factory()
    client = _client(owner)
    valid_body = _png_bytes()
    assert len(valid_body) < settings.MAX_UPLOAD_BYTES
    intent = client.post(
        "/api/v1/uploads/intents/",
        {
            "kind": "cover",
            "file_name": "cover.png",
            "content_type": "image/png",
            "size": len(valid_body),
        },
        format="json",
    )
    assert intent.status_code == 201
    asset = MediaAsset.objects.get(public_id=intent.data["asset_id"])
    before = MediaAsset.objects.values().get(pk=asset.pk)
    assert not default_storage.exists(asset.storage_key)
    actual_body = valid_body + b"x" * (settings.MAX_UPLOAD_BYTES + extra_bytes - len(valid_body))
    assert len(actual_body) > settings.MAX_UPLOAD_BYTES

    with (
        patch("apps.media_assets.tasks.process_media_asset.apply_async") as enqueue,
        django_capture_on_commit_callbacks(execute=True) as callbacks,
    ):
        rejected = client.put(intent.data["upload_url"], actual_body, content_type="image/png")
        assert rejected.status_code == 400
        assert rejected.data["error"]["details"]["file"] == [
            {
                "message": "The uploaded image size does not match the expected size. Try again.",
                "code": "invalid",
            }
        ]
        completion = client.post(f"/api/v1/uploads/{asset.public_id}/complete/", {}, format="json")
        assert completion.status_code == 400
        assert completion.data["error"]["details"]["file"] == [
            {
                "message": "The uploaded image was not found. Try uploading it again.",
                "code": "invalid",
            }
        ]

    assert callbacks == []
    enqueue.assert_not_called()
    assert MediaAsset.objects.values().get(pk=asset.pk) == before
    assert not default_storage.exists(asset.storage_key)


@pytest.mark.django_db
@pytest.mark.integration
def test_document_utf8_byte_boundary_and_rejected_save_preserve_persisted_draft(
    verified_user_factory, monkeypatch
) -> None:
    owner = verified_user_factory()
    bingo = create_bingo(
        author=owner,
        document=empty_draft_document(title="Byte limit", size=3, language="en"),
    )
    client = _client(owner)
    draft_url = f"/api/v1/bingos/{bingo.public_id}/draft/"
    expected = copy.deepcopy(bingo.draft.document)
    expected["description"] = "漢😀"
    encoded = _encoded_document(expected)
    # The real 512 KiB cap is unreachable through today's bounded fields (at
    # most 100 cells of 100 text + 160 alt characters). Lower only this cap to
    # isolate UTF-8 byte counting and the exact inclusive boundary.
    assert len(encoded) < document_validators.MAX_DOCUMENT_BYTES
    monkeypatch.setattr(document_validators, "MAX_DOCUMENT_BYTES", len(encoded))
    at_limit = copy.deepcopy(expected)
    at_limit["description"] = f"  {expected['description']}  "
    assert len(_encoded_document(at_limit)) > len(encoded)

    accepted = client.put(
        draft_url, {"document": at_limit}, format="json", HTTP_IF_MATCH='"draft-1"'
    )

    assert accepted.status_code == 200
    assert accepted.data["version"] == 2
    assert accepted["ETag"] == '"draft-2"'
    draft = Draft.objects.get(bingo=bingo)
    assert draft.document == expected
    assert len(_encoded_document(draft.document)) == document_validators.MAX_DOCUMENT_BYTES
    before = Draft.objects.values().get(pk=draft.pk)
    over_limit = copy.deepcopy(expected)
    over_limit["description"] += "x"
    over_encoded = _encoded_document(over_limit)
    assert len(over_encoded) == document_validators.MAX_DOCUMENT_BYTES + 1
    assert len(over_encoded.decode("utf-8")) < document_validators.MAX_DOCUMENT_BYTES

    rejected = client.put(
        draft_url,
        {"document": over_limit},
        format="json",
        HTTP_IF_MATCH=accepted["ETag"],
    )

    assert rejected.status_code == 400
    assert rejected.data["error"]["details"]["document"] == [
        {"message": "The draft document is too large.", "code": "invalid"}
    ]
    assert Draft.objects.values().get(pk=draft.pk) == before
    reloaded = client.get(draft_url)
    assert reloaded.status_code == 200
    assert reloaded["ETag"] == accepted["ETag"]
    assert reloaded.data["version"] == accepted.data["version"]


def test_maximum_multibyte_field_lengths_stay_below_real_document_byte_cap() -> None:
    document = empty_draft_document(title="😀" * 70, size=10, language="en")
    document["description"] = "😀" * 1000
    document["tags"] = [f"{position:02d}" + "漢" * 48 for position in range(15)]
    for cell in document["cells"]:
        cell["text"] = "😀" * 100
        cell["image_alt"] = "😀" * 160

    normalized = normalize_draft_document(document)

    assert normalized["description"] == document["description"]
    assert normalized["cells"] == document["cells"]
    assert len(_encoded_document(normalized)) < document_validators.MAX_DOCUMENT_BYTES


@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("description", "Description must be at most 1000 characters."),
        ("unexpected", "The draft document contains unsupported fields."),
    ],
)
def test_real_size_malformed_document_is_rejected_without_changing_draft(
    verified_user_factory, field: str, message: str
) -> None:
    owner = verified_user_factory()
    bingo = create_bingo(
        author=owner,
        document=empty_draft_document(title="Keep this draft", size=3, language="en"),
    )
    draft = bingo.draft
    before = Draft.objects.values().get(pk=draft.pk)
    malformed = copy.deepcopy(draft.document)
    malformed[field] = "x" * (document_validators.MAX_DOCUMENT_BYTES + 1)
    assert len(_encoded_document(malformed)) > document_validators.MAX_DOCUMENT_BYTES

    response = _client(owner).put(
        f"/api/v1/bingos/{bingo.public_id}/draft/",
        {"document": malformed},
        format="json",
        HTTP_IF_MATCH='"draft-1"',
    )

    assert response.status_code == 400
    error_field = field if field == "description" else "document"
    assert response.data["error"]["details"][error_field] == [
        {"message": message, "code": "invalid"}
    ]
    assert Draft.objects.values().get(pk=draft.pk) == before
