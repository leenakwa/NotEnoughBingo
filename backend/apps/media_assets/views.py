from __future__ import annotations

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.parsers import BaseParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.permissions import IsVerifiedUser
from apps.media_assets.models import MediaAsset
from apps.media_assets.serializers import (
    MediaAssetSerializer,
    UploadIntentResponseSerializer,
    UploadIntentSerializer,
)
from apps.media_assets.services import (
    asset_is_publicly_accessible,
    complete_upload,
    delete_unreferenced_asset,
    store_direct_upload,
)
from apps.media_assets.validators import AssetValidationError


class AssetInUse(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This asset is still in use."
    default_code = "asset_in_use"


class RawUploadParser(BaseParser):
    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        data = stream.read(int(settings.MAX_UPLOAD_BYTES) + 1)
        return {
            "file": SimpleUploadedFile(
                "direct-upload",
                data,
                content_type=(media_type or "application/octet-stream").split(";", 1)[0],
            )
        }


class UploadIntentView(APIView):
    permission_classes = [IsVerifiedUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

    @extend_schema(request=UploadIntentSerializer, responses={201: UploadIntentResponseSerializer})
    def post(self, request):
        serializer = UploadIntentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        asset = serializer.save()
        return Response(serializer.to_representation(asset), status=status.HTTP_201_CREATED)


class DirectUploadView(APIView):
    permission_classes = [IsVerifiedUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"
    parser_classes = [RawUploadParser]

    @extend_schema(request=OpenApiTypes.BINARY, responses={202: MediaAssetSerializer})
    def put(self, request, asset_id):
        asset = get_object_or_404(
            MediaAsset,
            public_id=asset_id,
            owner=request.user,
            status=MediaAsset.Status.PENDING,
        )
        uploaded = request.FILES.get("file") or request.data.get("file")
        if uploaded is None:
            raise ValidationError({"file": ["A file body is required."]})
        try:
            asset = store_direct_upload(asset=asset, owner=request.user, uploaded_file=uploaded)
        except AssetValidationError as exc:
            raise ValidationError({"file": [exc.code]}) from exc
        return Response(MediaAssetSerializer(asset).data, status=status.HTTP_202_ACCEPTED)


class UploadCompleteView(APIView):
    permission_classes = [IsVerifiedUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

    @extend_schema(request=None, responses={202: MediaAssetSerializer})
    def post(self, request, asset_id):
        asset = get_object_or_404(MediaAsset, public_id=asset_id, owner=request.user)
        try:
            asset = complete_upload(asset=asset, owner=request.user)
        except AssetValidationError as exc:
            raise ValidationError({"file": [exc.code]}) from exc
        return Response(MediaAssetSerializer(asset).data, status=status.HTTP_202_ACCEPTED)


class MediaAssetDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=MediaAssetSerializer)
    def get(self, request, asset_id):
        asset = get_object_or_404(
            MediaAsset.objects.prefetch_related("derivatives"),
            public_id=asset_id,
            owner=request.user,
        )
        return Response(MediaAssetSerializer(asset).data)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, asset_id):
        asset = get_object_or_404(MediaAsset, public_id=asset_id, owner=request.user)
        if not delete_unreferenced_asset(asset=asset, owner=request.user):
            raise AssetInUse()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MediaContentView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, asset_id):
        asset = get_object_or_404(
            MediaAsset.objects.select_related("owner", "parent"),
            public_id=asset_id,
            status=MediaAsset.Status.READY,
            deleted_at__isnull=True,
        )
        is_owner = bool(
            request.user.is_authenticated
            and (
                request.user.pk == asset.owner_id
                or request.user.has_perm("moderation.view_private_content")
            )
        )
        if not is_owner and not asset_is_publicly_accessible(asset):
            # Do not disclose whether a private asset exists.
            raise NotFound()
        if not default_storage.exists(asset.storage_key):
            raise NotFound()
        is_export = asset.kind in {
            MediaAsset.Kind.BINGO_EXPORT,
            MediaAsset.Kind.ACCOUNT_EXPORT,
        }
        response = FileResponse(
            default_storage.open(asset.storage_key, "rb"),
            content_type=asset.detected_mime or asset.declared_mime or "application/octet-stream",
            as_attachment=is_export,
            filename=(
                f"not-enough-bingo-{asset.kind}-{asset.public_id}{asset.extension}"
                if is_export
                else None
            ),
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = (
            "public, max-age=3600" if not is_owner else "private, max-age=300"
        )
        return response
