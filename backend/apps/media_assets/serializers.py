from __future__ import annotations

from rest_framework import serializers

from apps.media_assets.models import MediaAsset
from apps.media_assets.services import build_upload_instructions, create_upload_intent
from apps.media_assets.validators import AssetValidationError


class MediaAssetSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    kind = serializers.SerializerMethodField()
    mime_type = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    thumbnail_id = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = (
            "id",
            "public_id",
            "kind",
            "status",
            "variant",
            "mime_type",
            "declared_mime",
            "detected_mime",
            "byte_size",
            "width",
            "height",
            "url",
            "thumbnail_id",
            "thumbnail_url",
            "rejection_reason",
            "created_at",
            "ready_at",
        )
        read_only_fields = fields

    def get_thumbnail_id(self, obj: MediaAsset) -> str | None:
        thumbnail = next(
            (
                item
                for item in obj.derivatives.all()
                if item.variant == MediaAsset.Variant.THUMBNAIL
                and item.status == MediaAsset.Status.READY
            ),
            None,
        )
        return str(thumbnail.public_id) if thumbnail else None

    def get_mime_type(self, obj: MediaAsset) -> str:
        return obj.detected_mime or obj.declared_mime

    def get_kind(self, obj: MediaAsset) -> str:
        if obj.kind in {MediaAsset.Kind.BINGO_EXPORT, MediaAsset.Kind.ACCOUNT_EXPORT}:
            return "export"
        return obj.kind

    def get_url(self, obj: MediaAsset) -> str | None:
        if not obj.is_ready:
            return None
        return f"/api/v1/media/{obj.public_id}/"

    def get_thumbnail_url(self, obj: MediaAsset) -> str | None:
        thumbnail_id = self.get_thumbnail_id(obj)
        return f"/api/v1/media/{thumbnail_id}/" if thumbnail_id else None


class UploadInstructionSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=("PUT", "POST"), read_only=True)
    url = serializers.CharField(read_only=True)
    headers = serializers.DictField(child=serializers.CharField(), read_only=True)
    fields = serializers.DictField(child=serializers.CharField(), read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class UploadIntentResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    asset_id = serializers.UUIDField(read_only=True)
    status = serializers.ChoiceField(choices=MediaAsset.Status.choices, read_only=True)
    asset = MediaAssetSerializer(read_only=True)
    upload = UploadInstructionSerializer(read_only=True)
    upload_url = serializers.CharField(read_only=True)
    method = serializers.ChoiceField(choices=("PUT", "POST"), read_only=True)
    headers = serializers.DictField(child=serializers.CharField(), read_only=True)
    fields = serializers.DictField(child=serializers.CharField(), read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class UploadIntentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=(
            MediaAsset.Kind.AVATAR,
            MediaAsset.Kind.COVER,
            MediaAsset.Kind.BOARD_BACKGROUND,
            MediaAsset.Kind.CELL_IMAGE,
        )
    )
    file_name = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    size = serializers.IntegerField(min_value=1)
    checksum_sha256 = serializers.CharField(
        min_length=64,
        max_length=64,
        required=False,
        allow_blank=True,
    )

    def create(self, validated_data: dict) -> MediaAsset:
        try:
            return create_upload_intent(
                owner=self.context["request"].user,
                kind=validated_data["kind"],
                filename=validated_data["file_name"],
                content_type=validated_data["content_type"],
                size_bytes=validated_data["size"],
                checksum_sha256=validated_data.get("checksum_sha256", ""),
            )
        except AssetValidationError as exc:
            raise serializers.ValidationError({"file": exc.code}) from exc

    def to_representation(self, instance: MediaAsset) -> dict:
        asset = MediaAssetSerializer(instance).data
        upload = build_upload_instructions(instance)
        return {
            "id": str(instance.public_id),
            "asset_id": str(instance.public_id),
            "status": instance.status,
            "asset": asset,
            "upload": upload,
            "upload_url": upload["url"],
            "method": upload["method"],
            "headers": upload.get("headers", {}),
            "fields": upload.get("fields", {}),
            "expires_at": upload["expires_at"],
        }
