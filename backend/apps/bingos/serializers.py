from __future__ import annotations

import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.helpers import lazy_serializer
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.bingos.models import Bingo, BingoCell, BingoRevision, Draft, Tag
from apps.bingos.services import create_bingo
from apps.bingos.validators import normalize_draft_document
from apps.media_assets.models import MediaAsset
from apps.media_assets.serializers import MediaAssetSerializer


class TagSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    usage_count = serializers.IntegerField(source="public_usage_count", read_only=True)

    class Meta:
        model = Tag
        fields = ("id", "name", "slug", "usage_count")


class TagReferenceSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.SlugField(read_only=True, allow_unicode=True)


class RevisionTagSerializer(serializers.Serializer):
    name = serializers.CharField(read_only=True)
    slug = serializers.SlugField(read_only=True, allow_unicode=True)


class MarkingConfigSerializer(serializers.Serializer):
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    opacity = serializers.FloatField(min_value=0, max_value=1, required=False)


class BingoStatsSerializer(serializers.Serializer):
    likes = serializers.IntegerField(min_value=0, read_only=True)
    comments = serializers.IntegerField(min_value=0, read_only=True)
    plays = serializers.IntegerField(min_value=0, read_only=True)
    shares = serializers.IntegerField(min_value=0, read_only=True)
    views = serializers.IntegerField(min_value=0, read_only=True)


class BingoPermissionsSerializer(serializers.Serializer):
    can_edit = serializers.BooleanField(read_only=True)
    can_comment = serializers.BooleanField(read_only=True)
    can_like = serializers.BooleanField(read_only=True)
    can_report = serializers.BooleanField(read_only=True)


class BingoDocumentCellInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    position = serializers.IntegerField(min_value=0, max_value=99, required=False)
    row = serializers.IntegerField(min_value=0, max_value=9, required=False)
    column = serializers.IntegerField(min_value=0, max_value=9, required=False)
    text = serializers.CharField(max_length=100, required=False, allow_blank=True)
    text_color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    bold = serializers.BooleanField(required=False)
    italic = serializers.BooleanField(required=False)
    underline = serializers.BooleanField(required=False)
    strikethrough = serializers.BooleanField(required=False)
    background_color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    background_opacity = serializers.FloatField(min_value=0, max_value=1, required=False)
    image_asset_id = serializers.UUIDField(required=False, allow_null=True)
    image_opacity = serializers.FloatField(min_value=0, max_value=1, required=False)
    border_color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    border_width = serializers.IntegerField(min_value=0, max_value=12, required=False)
    border_style = serializers.ChoiceField(choices=BingoCell.BorderStyle.choices, required=False)


class BingoDocumentInputSerializer(serializers.Serializer):
    schema_version = serializers.IntegerField(min_value=1, max_value=1, required=False)
    title = serializers.CharField(max_length=70, required=False, allow_blank=True)
    description = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    size = serializers.IntegerField(min_value=3, max_value=10, required=False)
    visibility = serializers.ChoiceField(choices=Bingo.Visibility.choices, required=False)
    completion_style = serializers.ChoiceField(
        choices=Bingo.MarkingStyle.choices,
        required=False,
    )
    marking_config = MarkingConfigSerializer(required=False)
    cover_id = serializers.UUIDField(required=False, allow_null=True)
    board_background_id = serializers.UUIDField(required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=50),
        max_length=15,
        required=False,
    )
    cells = BingoDocumentCellInputSerializer(many=True, required=False)


class DraftDocumentInputSerializer(BingoDocumentInputSerializer):
    version = serializers.IntegerField(min_value=1, required=False)


class BingoAuthorSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    public_id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(read_only=True)
    display_name = serializers.CharField(source="profile.display_name", read_only=True)
    avatar = MediaAssetSerializer(source="profile.avatar", read_only=True, allow_null=True)


class BingoCellSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    image_asset_id = serializers.UUIDField(
        source="image.public_id",
        read_only=True,
        allow_null=True,
    )
    image = MediaAssetSerializer(read_only=True, allow_null=True)

    class Meta:
        model = BingoCell
        fields = (
            "id",
            "position",
            "row",
            "column",
            "text",
            "text_color",
            "bold",
            "italic",
            "underline",
            "strikethrough",
            "background_color",
            "background_opacity",
            "image_asset_id",
            "image",
            "image_opacity",
            "border_color",
            "border_width",
            "border_style",
        )


class BingoRevisionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    number = serializers.IntegerField(source="revision_number", read_only=True)
    cells = BingoCellSerializer(many=True, read_only=True)
    cover = MediaAssetSerializer(read_only=True, allow_null=True)
    board_background = MediaAssetSerializer(source="background", read_only=True, allow_null=True)
    marking_config = MarkingConfigSerializer(read_only=True)
    completion_style = serializers.ChoiceField(
        source="marking_style",
        choices=Bingo.MarkingStyle.choices,
        read_only=True,
    )
    cover_asset_id = serializers.UUIDField(
        source="cover.public_id",
        read_only=True,
        allow_null=True,
    )
    background_asset_id = serializers.UUIDField(
        source="background.public_id",
        read_only=True,
        allow_null=True,
    )
    tags = serializers.SerializerMethodField()

    class Meta:
        model = BingoRevision
        fields = (
            "id",
            "public_id",
            "number",
            "revision_number",
            "title",
            "description",
            "size",
            "visibility",
            "marking_style",
            "completion_style",
            "marking_config",
            "cover",
            "board_background",
            "cover_asset_id",
            "background_asset_id",
            "schema_version",
            "document_hash",
            "tags",
            "cells",
            "published_at",
        )

    @extend_schema_field(RevisionTagSerializer(many=True))
    def get_tags(self, obj: BingoRevision) -> list[dict]:
        return [{"name": item.name, "slug": item.slug} for item in obj.revision_tags.all()]


class BingoCardPreviewSerializer(serializers.ModelSerializer):
    board_background = MediaAssetSerializer(source="background", read_only=True, allow_null=True)
    cells = BingoCellSerializer(many=True, read_only=True)

    class Meta:
        model = BingoRevision
        fields = ("size", "board_background", "cells")


class BingoCardSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    author = BingoAuthorSerializer(read_only=True)
    cover = MediaAssetSerializer(read_only=True, allow_null=True)
    completion_style = serializers.ChoiceField(
        source="marking_style",
        choices=Bingo.MarkingStyle.choices,
        read_only=True,
    )
    cover_asset_id = serializers.UUIDField(
        source="cover.public_id",
        read_only=True,
        allow_null=True,
    )
    current_revision_id = serializers.UUIDField(
        source="current_revision.public_id",
        read_only=True,
        allow_null=True,
    )
    preview = BingoCardPreviewSerializer(
        source="current_revision",
        read_only=True,
        allow_null=True,
    )
    tags = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Bingo
        fields = (
            "id",
            "public_id",
            "title",
            "description",
            "size",
            "status",
            "visibility",
            "marking_style",
            "completion_style",
            "cover",
            "cover_asset_id",
            "current_revision_id",
            "preview",
            "author",
            "tags",
            "stats",
            "liked_by_me",
            "view_count",
            "like_count",
            "comment_count",
            "play_count",
            "share_count",
            "trending_score",
            "published_at",
            "updated_at",
        )

    @extend_schema_field(TagReferenceSerializer(many=True))
    def get_tags(self, obj: Bingo) -> list[dict]:
        return [
            {"id": str(link.tag.public_id), "name": link.tag.name, "slug": link.tag.slug}
            for link in obj.tag_links.all()
            if link.tag.hidden_at is None
        ]

    @extend_schema_field(BingoStatsSerializer)
    def get_stats(self, obj: Bingo) -> dict:
        return {
            "likes": obj.like_count,
            "comments": obj.comment_count,
            "plays": obj.play_count,
            "shares": obj.share_count,
            "views": obj.view_count,
        }

    def get_liked_by_me(self, obj: Bingo) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        viewer_likes = getattr(obj, "_viewer_likes", None)
        if viewer_likes is not None:
            return bool(viewer_likes)
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("likes")
        if prefetched is not None:
            return any(like.user_id == request.user.pk for like in prefetched)
        return obj.likes.filter(user=request.user).exists()


class BingoDetailSerializer(BingoCardSerializer):
    current_revision = BingoRevisionSerializer(read_only=True, allow_null=True)
    marking_config = MarkingConfigSerializer(read_only=True)
    background_asset_id = serializers.UUIDField(
        source="background.public_id",
        read_only=True,
        allow_null=True,
    )
    is_owner = serializers.SerializerMethodField()
    editable_draft = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta(BingoCardSerializer.Meta):
        fields = (
            *BingoCardSerializer.Meta.fields,
            "background_asset_id",
            "marking_config",
            "current_revision",
            "is_owner",
            "editable_draft",
            "permissions",
            "created_at",
        )

    def get_is_owner(self, obj: Bingo) -> bool:
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and request.user.pk == obj.author_id)

    @extend_schema_field(
        lazy_serializer("apps.bingos.serializers.DraftSerializer")(allow_null=True)
    )
    def get_editable_draft(self, obj: Bingo) -> dict | None:
        if not self.get_is_owner(obj):
            return None
        try:
            draft = obj.draft
        except Draft.DoesNotExist:
            return None
        return DraftSerializer(draft, context=self.context).data

    @extend_schema_field(BingoPermissionsSerializer)
    def get_permissions(self, obj: Bingo) -> dict:
        request = self.context.get("request")
        authenticated = bool(request and request.user.is_authenticated)
        can_edit = (
            authenticated and request.user.pk == obj.author_id and request.user.can_create_content
        )
        return {
            "can_edit": can_edit,
            "can_comment": authenticated and obj.status == Bingo.Status.PUBLISHED,
            "can_like": authenticated and obj.status == Bingo.Status.PUBLISHED,
            "can_report": authenticated and request.user.pk != obj.author_id,
        }


class DraftCellSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    row = serializers.IntegerField(min_value=0, max_value=9, read_only=True)
    column = serializers.IntegerField(min_value=0, max_value=9, read_only=True)
    text = serializers.CharField(read_only=True)
    text_color = serializers.CharField(read_only=True)
    bold = serializers.BooleanField(read_only=True)
    italic = serializers.BooleanField(read_only=True)
    underline = serializers.BooleanField(read_only=True)
    strikethrough = serializers.BooleanField(read_only=True)
    background_color = serializers.CharField(read_only=True)
    background_opacity = serializers.FloatField(read_only=True)
    image = MediaAssetSerializer(read_only=True, allow_null=True)
    image_opacity = serializers.FloatField(read_only=True)
    border_color = serializers.CharField(read_only=True)
    border_width = serializers.IntegerField(read_only=True)
    border_style = serializers.ChoiceField(choices=BingoCell.BorderStyle.choices, read_only=True)


class DraftSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    public_id = serializers.UUIDField(read_only=True)
    bingo_id = serializers.UUIDField(read_only=True, allow_null=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    size = serializers.IntegerField(min_value=3, max_value=10, read_only=True)
    visibility = serializers.ChoiceField(choices=Bingo.Visibility.choices, read_only=True)
    completion_style = serializers.ChoiceField(
        choices=Bingo.MarkingStyle.choices,
        read_only=True,
    )
    board_background = MediaAssetSerializer(read_only=True, allow_null=True)
    cover = MediaAssetSerializer(read_only=True, allow_null=True)
    tags = TagReferenceSerializer(many=True, read_only=True)
    cells = DraftCellSerializer(many=True, read_only=True)
    version = serializers.IntegerField(min_value=1, read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    etag = serializers.CharField(read_only=True)

    def to_representation(self, obj: Draft) -> dict:
        document = obj.document
        asset_ids = {
            value
            for value in (
                document.get("cover_asset_id"),
                document.get("background_asset_id"),
                *(cell.get("image_asset_id") for cell in document.get("cells", [])),
            )
            if value
        }
        assets = {
            str(asset.public_id): asset
            for asset in MediaAsset.objects.filter(public_id__in=asset_ids).prefetch_related(
                "derivatives"
            )
        }
        tag_rows = {
            tag.name.casefold(): tag
            for tag in Tag.objects.filter(name__in=document.get("tags", []))
        }
        tags = []
        for name in document.get("tags", []):
            row = tag_rows.get(name.casefold())
            tag_id = row.public_id if row else uuid.uuid5(uuid.NAMESPACE_URL, f"neb-tag:{name}")
            tags.append(
                {
                    "id": str(tag_id),
                    "name": name,
                    "slug": row.slug if row else name.replace(" ", "-"),
                }
            )
        cells = []
        for cell in document.get("cells", []):
            image = assets.get(cell.get("image_asset_id"))
            cells.append(
                {
                    "id": cell.get("id"),
                    "row": cell["row"],
                    "column": cell["column"],
                    "text": cell["text"],
                    "text_color": cell["text_color"],
                    "bold": cell["bold"],
                    "italic": cell["italic"],
                    "underline": cell["underline"],
                    "strikethrough": cell["strikethrough"],
                    "background_color": cell["background_color"],
                    "background_opacity": cell["background_opacity"],
                    "image": MediaAssetSerializer(image).data if image else None,
                    "image_opacity": cell["image_opacity"],
                    "border_color": cell["border_color"],
                    "border_width": cell["border_width"],
                    "border_style": cell["border_style"],
                }
            )
        cover = assets.get(document.get("cover_asset_id"))
        background = assets.get(document.get("background_asset_id"))
        return {
            "id": str(obj.public_id),
            "public_id": str(obj.public_id),
            "bingo_id": str(obj.bingo.public_id) if obj.bingo_id else None,
            "title": document.get("title", ""),
            "description": document.get("description", ""),
            "size": document.get("size", 5),
            "visibility": document.get("visibility", Bingo.Visibility.PRIVATE),
            "completion_style": document.get(
                "marking_style",
                Bingo.MarkingStyle.CHECKMARK,
            ),
            "board_background": MediaAssetSerializer(background).data if background else None,
            "cover": MediaAssetSerializer(cover).data if cover else None,
            "tags": tags,
            "cells": cells,
            "version": obj.version,
            "updated_at": obj.updated_at,
            "etag": f'"draft-{obj.version}"',
        }


class DraftWriteSerializer(serializers.Serializer):
    document = serializers.JSONField()

    def to_internal_value(self, data) -> dict:
        if isinstance(data, dict) and "document" in data:
            raw_document = data["document"]
        elif isinstance(data, dict):
            raw_document = {key: value for key, value in data.items() if key != "version"}
        else:
            raw_document = data
        return {"document": self.validate_document(raw_document)}

    def validate_document(self, value: object) -> dict:
        try:
            return normalize_draft_document(value)
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise serializers.ValidationError(exc.message_dict) from exc
            raise serializers.ValidationError(exc.messages) from exc


class BingoCreateSerializer(serializers.Serializer):
    document = serializers.JSONField(required=False)

    def to_internal_value(self, data) -> dict:
        if not data:
            return {}
        if isinstance(data, dict) and "document" in data:
            raw_document = data["document"]
        else:
            raw_document = data
        return {"document": self.validate_document(raw_document)}

    def validate_document(self, value: object) -> dict:
        try:
            return normalize_draft_document(value)
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise serializers.ValidationError(exc.message_dict) from exc
            raise serializers.ValidationError(exc.messages) from exc

    def create(self, validated_data: dict) -> Bingo:
        try:
            return create_bingo(
                author=self.context["request"].user,
                document=validated_data.get("document"),
            )
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise serializers.ValidationError(exc.message_dict) from exc
            raise serializers.ValidationError(exc.messages) from exc
