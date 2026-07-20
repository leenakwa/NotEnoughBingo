from __future__ import annotations

import hashlib
import io
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.accounts.services import (
    schedule_account_deletion,
    token_digest,
    verify_email,
)
from apps.accounts.tasks import process_scheduled_account_deletions
from apps.accounts.views import LoginView, RegisterView
from apps.bingos.models import Bingo
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.media_assets.models import MediaAsset
from apps.media_assets.services import (
    asset_is_publicly_accessible,
    asset_is_referenced,
    create_upload_intent,
    delete_unreferenced_asset,
    store_direct_upload,
)
from apps.media_assets.tasks import process_media_asset
from apps.plays.services import can_view_shared_result, create_shared_result

pytestmark = pytest.mark.django_db


def _png_bytes(*, size: tuple[int, int] = (24, 16)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, "#ffffff").save(output, format="PNG")
    return output.getvalue()


def _ready_cell_asset(*, owner: User, data: bytes | None = None) -> MediaAsset:
    content = data or _png_bytes()
    key = f"test-media/{uuid4()}.png"
    stored_key = default_storage.save(key, ContentFile(content))
    return MediaAsset.objects.create(
        owner=owner,
        kind=MediaAsset.Kind.CELL_IMAGE,
        status=MediaAsset.Status.READY,
        storage_key=stored_key,
        original_filename="cell.png",
        extension=".png",
        declared_mime="image/png",
        detected_mime="image/png",
        expected_size=len(content),
        byte_size=len(content),
        checksum_sha256=hashlib.sha256(content).hexdigest(),
        width=24,
        height=16,
        ready_at=timezone.now(),
    )


def _csrf_api_client(user: User | None = None) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    if user is not None:
        client.force_login(user)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    client.credentials(
        HTTP_X_CSRFTOKEN=client.cookies[settings.CSRF_COOKIE_NAME].value,
    )
    return client


def test_suspended_verified_staff_cannot_log_in_to_django_admin(
    verified_user_factory,
) -> None:
    password = "Staff-Password-That-Is-Strong-42"  # noqa: S105
    staff = verified_user_factory(
        username="suspended_staff",
        email="suspended-staff@example.test",
        password=password,
        is_staff=True,
        suspended_at=timezone.now(),
    )
    client = Client()

    response = client.post(
        "/admin/login/?next=/admin/",
        {
            "username": staff.username,
            "password": password,
            "next": "/admin/",
        },
    )

    assert response.status_code == 200
    assert SESSION_KEY not in client.session
    assert client.login(username=staff.username, password=password) is False


def test_anonymous_drf_throttle_cannot_be_bypassed_with_a_forged_leading_xff() -> None:
    rest_framework = {
        **settings.REST_FRAMEWORK,
        "NUM_PROXIES": 1,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "anon": "1/min",
        },
    }
    factory = APIRequestFactory()

    with override_settings(REST_FRAMEWORK=rest_framework):
        first = factory.get(
            "/api/v1/health/live/",
            REMOTE_ADDR="10.0.0.10",
            HTTP_X_FORWARDED_FOR="198.51.100.1, 203.0.113.25",
        )
        first.user = AnonymousUser()
        second = factory.get(
            "/api/v1/health/live/",
            REMOTE_ADDR="10.0.0.10",
            HTTP_X_FORWARDED_FOR="192.0.2.200, 203.0.113.25",
        )
        second.user = AnonymousUser()
        first_throttle = AnonRateThrottle()
        second_throttle = AnonRateThrottle()
        for throttle in (first_throttle, second_throttle):
            throttle.rate = "1/min"
            throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)

        assert first_throttle.get_ident(first) == "203.0.113.25"
        assert second_throttle.get_ident(second) == "203.0.113.25"
        assert first_throttle.get_cache_key(first, None) == second_throttle.get_cache_key(
            second,
            None,
        )
        assert first_throttle.allow_request(first, None) is True
        assert second_throttle.allow_request(second, None) is False


def test_pending_registration_cannot_log_in_and_each_link_owns_its_credentials(
    csrf_request,
) -> None:
    email = "pending-owner@example.test"
    first_token = "first-registration-token-with-at-least-thirty-two-bytes"  # noqa: S105
    second_token = "second-registration-token-with-at-least-thirty-two-bytes"  # noqa: S105
    first_password = "First-Registration-Password-42"  # noqa: S105
    second_password = "Second-Registration-Password-84"  # noqa: S105

    with (
        patch(
            "apps.accounts.services.secrets.token_urlsafe",
            side_effect=[first_token, second_token],
        ),
        patch("apps.accounts.services.send_verification_email.delay"),
    ):
        first_registration = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {
                    "email": email,
                    "username": "first_identity",
                    "display_name": "First Identity",
                    "password": first_password,
                },
            )
        )
        second_registration = RegisterView.as_view()(
            csrf_request(
                "post",
                "/api/v1/auth/register/",
                {
                    "email": email,
                    "username": "second_identity",
                    "display_name": "Second Identity",
                    "password": second_password,
                },
            )
        )

    assert first_registration.status_code == second_registration.status_code == 202
    pending = User.objects.get(email=email)
    assert pending.is_active is False
    assert not pending.has_usable_password()
    before_verification = LoginView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/login/",
            {"email": email, "password": first_password},
            with_session=True,
        )
    )
    assert before_verification.status_code == 400

    verified = verify_email(first_token)

    verified.refresh_from_db()
    assert verified.username == "first_identity"
    assert verified.profile.display_name == "First Identity"
    assert verified.check_password(first_password)
    assert not verified.check_password(second_password)
    assert EmailVerification.objects.filter(
        user=verified,
        token_hash=token_digest(second_token),
        used_at__isnull=False,
    ).exists()
    with pytest.raises(DjangoValidationError, match="invalid or has already been used"):
        verify_email(second_token)

    after_verification = LoginView.as_view()(
        csrf_request(
            "post",
            "/api/v1/auth/login/",
            {"email": email, "password": first_password},
            with_session=True,
        )
    )
    assert after_verification.status_code == 200


def test_scheduled_deletion_revokes_sessions_blocks_writes_and_scrubs_identity(
    verified_user_factory,
) -> None:
    password = "Deletion-Password-That-Is-Strong-42"  # noqa: S105
    user = verified_user_factory(
        username="erase_this_identity",
        email="erase-this-identity@example.test",
        password=password,
        first_name="Original",
        last_name="Person",
    )
    user.profile.display_name = "Original Display Name"
    user.profile.bio = "Original private biography"
    user.profile.save(update_fields=("display_name", "bio", "updated_at"))
    EmailVerification.objects.create(
        user=user,
        email=user.email,
        purpose=EmailVerification.Purpose.CHANGE_EMAIL,
        token_hash=hashlib.sha256(b"deletion-test-token").hexdigest(),
        expires_at=timezone.now() + timedelta(hours=1),
    )
    store = SessionStore()
    store[SESSION_KEY] = str(user.pk)
    store.save()
    session = SessionMetadata.objects.create(
        user=user,
        session_key=store.session_key,
        ip_hash="sensitive-ip-digest",
        user_agent="Sensitive browser fingerprint",
        last_seen_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=1),
    )

    deletion = schedule_account_deletion(user)

    user.refresh_from_db()
    session.refresh_from_db()
    assert deletion.status == AccountDeletionRequest.Status.SCHEDULED
    assert user.deletion_requested_at is not None
    assert session.revoked_at is not None
    assert not SessionStore().exists(store.session_key)

    pending_client = _csrf_api_client()
    pending_login = pending_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        format="json",
    )
    assert pending_login.status_code == 200
    blocked_write = pending_client.post(
        "/api/v1/bingos/",
        empty_draft_document(title="Must not be created"),
        format="json",
    )
    assert blocked_write.status_code == 403
    assert not Bingo.objects.filter(author=user).exists()

    AccountDeletionRequest.objects.filter(pk=deletion.pk).update(
        scheduled_for=timezone.now() - timedelta(seconds=1),
    )
    processed = process_scheduled_account_deletions.run()

    assert processed == 1
    user.refresh_from_db()
    deletion.refresh_from_db()
    assert deletion.status == AccountDeletionRequest.Status.COMPLETE
    assert deletion.completed_at is not None
    assert user.is_active is False
    assert user.deleted_at is not None
    assert user.email.startswith("deleted-")
    assert user.email.endswith("@deleted.invalid")
    assert user.email != "erase-this-identity@example.test"
    assert user.username.startswith("deleted-")
    assert user.username != "erase_this_identity"
    assert user.first_name == ""
    assert user.last_name == ""
    assert not user.has_usable_password()
    assert user.profile.display_name == "Deleted user"
    assert user.profile.bio == ""
    assert not SessionMetadata.objects.filter(user=user).exists()
    assert not EmailVerification.objects.filter(user=user).exists()
    assert not SecurityEvent.objects.filter(user=user).exists()
    erased_events = SecurityEvent.objects.filter(
        event_type=SecurityEvent.EventType.ACCOUNT_DELETED,
        user__isnull=True,
    )
    assert erased_events.count() == 1
    assert erased_events.get().ip_hash == ""
    assert erased_events.get().user_agent == ""
    assert erased_events.get().metadata == {}


def test_draft_only_cell_media_is_a_reference_and_cannot_be_deleted(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="draft_media_author")
    asset = _ready_cell_asset(owner=author)
    document = empty_draft_document(title="Draft media reference")
    document["cells"][0]["image_asset_id"] = str(asset.public_id)

    bingo = create_bingo(author=author, document=document)

    assert bingo.current_revision_id is None
    assert bingo.draft.media_links.filter(asset=asset).exists()
    assert asset_is_referenced(asset) is True
    assert delete_unreferenced_asset(asset=asset, owner=author) is False
    asset.refresh_from_db()
    assert asset.status == MediaAsset.Status.READY
    assert default_storage.exists(asset.storage_key)


def test_processed_media_moves_from_client_writable_staging_to_immutable_key(
    verified_user_factory,
    django_capture_on_commit_callbacks,
) -> None:
    owner = verified_user_factory(username="media_promotion_owner")
    content = _png_bytes(size=(31, 19))
    asset = create_upload_intent(
        owner=owner,
        kind=MediaAsset.Kind.COVER,
        filename="cell.png",
        content_type="image/png",
        size_bytes=len(content),
    )
    staging_key = asset.storage_key
    store_direct_upload(
        asset=asset,
        owner=owner,
        uploaded_file=SimpleUploadedFile(
            "cell.png",
            content,
            content_type="image/png",
        ),
    )
    assert staging_key.startswith("staging/uploads/")
    assert default_storage.exists(staging_key)

    with django_capture_on_commit_callbacks(execute=True):
        result = process_media_asset.run(asset.pk)

    asset.refresh_from_db()
    assert result == "ready"
    assert asset.status == MediaAsset.Status.READY
    assert asset.storage_key != staging_key
    assert asset.storage_key.startswith(f"media/{owner.public_id}/{asset.public_id}/")
    assert asset.storage_key.endswith(f"{asset.checksum_sha256}.webp")
    assert default_storage.exists(asset.storage_key)
    assert not default_storage.exists(staging_key)
    with default_storage.open(asset.storage_key, "rb") as stored:
        normalized = stored.read()
    assert normalized != content
    assert hashlib.sha256(normalized).hexdigest() == asset.checksum_sha256
    assert asset.width == 31
    assert asset.height == 19
    assert asset.detected_mime == "image/webp"
    thumbnail = asset.derivatives.get(variant=MediaAsset.Variant.THUMBNAIL)
    assert thumbnail.storage_key.startswith("media/derived/")
    assert default_storage.exists(thumbnail.storage_key)


def test_duplicate_media_worker_cannot_steal_an_active_processing_claim(
    verified_user_factory,
) -> None:
    owner = verified_user_factory(username="media_processing_claim_owner")
    content = _png_bytes(size=(17, 13))
    asset = create_upload_intent(
        owner=owner,
        kind=MediaAsset.Kind.CELL_IMAGE,
        filename="cell.png",
        content_type="image/png",
        size_bytes=len(content),
    )
    store_direct_upload(
        asset=asset,
        owner=owner,
        uploaded_file=SimpleUploadedFile("cell.png", content, content_type="image/png"),
    )
    MediaAsset.objects.filter(pk=asset.pk).update(
        status=MediaAsset.Status.PROCESSING,
        processing_task_id="already-claimed-task",
    )

    result = process_media_asset.run(asset.pk)

    assert result == "already_processing"
    asset.refresh_from_db()
    assert asset.processing_task_id == "already-claimed-task"


def test_hidden_bingo_makes_shared_revision_media_unavailable(
    verified_user_factory,
) -> None:
    author = verified_user_factory(username="hidden_share_media_author")
    asset = _ready_cell_asset(owner=author)
    document = empty_draft_document(title="Hidden share media")
    document["visibility"] = Bingo.Visibility.PUBLIC
    document["cells"][0]["image_asset_id"] = str(asset.public_id)
    bingo = create_bingo(author=author, document=document)
    revision = publish_bingo(
        bingo=bingo,
        actor=author,
        idempotency_key="hidden-share-media-publish",
    )
    result = create_shared_result(
        bingo=bingo,
        revision_id=revision.public_id,
        selected_cells=[str(revision.cells.get(position=0).public_id)],
        display_name="Author",
        idempotency_key="hidden-share-media-result",
        actor=author,
    )
    guest = _csrf_api_client()

    assert asset_is_publicly_accessible(asset) is True
    assert guest.get(f"/api/v1/media/{asset.public_id}/").status_code == 200

    Bingo.objects.filter(pk=bingo.pk).update(
        hidden_at=timezone.now(),
        hidden_reason="Moderation regression test",
    )
    bingo.refresh_from_db()
    result.bingo = bingo

    assert can_view_shared_result(result=result, user=AnonymousUser()) is False
    assert asset_is_publicly_accessible(asset) is False
    assert guest.get(f"/api/v1/media/{asset.public_id}/").status_code == 404
