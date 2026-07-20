from __future__ import annotations

from rest_framework import serializers

from apps.bingos.serializers import BingoAuthorSerializer, BingoRevisionSerializer
from apps.plays.models import PlayProgress, SharedResult


class ProgressWriteSerializer(serializers.Serializer):
    selected_cells = serializers.ListField(
        child=serializers.CharField(max_length=64),
        allow_empty=True,
        max_length=100,
    )
    version = serializers.IntegerField(min_value=0, required=False)
    revision_id = serializers.UUIDField(required=False, allow_null=True)


class PlayProgressSerializer(serializers.ModelSerializer):
    public_id = serializers.UUIDField(read_only=True, allow_null=True)
    bingo_id = serializers.UUIDField(source="bingo.public_id", read_only=True)
    revision_id = serializers.UUIDField(source="revision.public_id", read_only=True)
    revision_number = serializers.IntegerField(source="revision.revision_number", read_only=True)
    selected_cells = serializers.ListField(
        child=serializers.UUIDField(),
        read_only=True,
    )
    stale = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True, allow_null=True)
    updated_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = PlayProgress
        fields = (
            "public_id",
            "bingo_id",
            "revision_id",
            "revision_number",
            "selected_cells",
            "version",
            "stale",
            "reset_at",
            "created_at",
            "updated_at",
        )

    def get_stale(self, obj: PlayProgress) -> bool:
        return obj.revision_id != obj.bingo.current_revision_id


class SharedResultCreateSerializer(serializers.Serializer):
    selected_cells = serializers.ListField(
        child=serializers.CharField(max_length=64),
        allow_empty=True,
        max_length=100,
    )
    display_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    revision_id = serializers.UUIDField(required=False, allow_null=True)


class SharedResultSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="share_id", read_only=True)
    bingo_id = serializers.UUIDField(source="bingo.public_id", read_only=True)
    revision = BingoRevisionSerializer(read_only=True)
    owner_id = serializers.UUIDField(source="owner.public_id", read_only=True, allow_null=True)
    owner = BingoAuthorSerializer(read_only=True, allow_null=True)
    selected_cells = serializers.ListField(
        child=serializers.UUIDField(),
        read_only=True,
    )
    source_url = serializers.SerializerMethodField()
    share_url = serializers.SerializerMethodField()
    read_only = serializers.BooleanField(default=True, read_only=True)

    class Meta:
        model = SharedResult
        fields = (
            "id",
            "share_id",
            "bingo_id",
            "owner_id",
            "owner",
            "owner_display_name",
            "selected_cells",
            "access",
            "revision",
            "source_url",
            "share_url",
            "read_only",
            "created_at",
        )

    def get_source_url(self, obj: SharedResult) -> str:
        return f"/bingo/{obj.bingo.public_id}"

    def get_share_url(self, obj: SharedResult) -> str:
        return f"/share/{obj.bingo.public_id}/{obj.share_id}"


class ProfilePlayProgressSerializer(serializers.ModelSerializer):
    bingo_id = serializers.UUIDField(source="bingo.public_id", read_only=True)
    bingo_title = serializers.CharField(source="bingo.title", read_only=True)
    revision_number = serializers.IntegerField(
        source="revision.revision_number",
        read_only=True,
    )
    selected_count = serializers.SerializerMethodField()

    class Meta:
        model = PlayProgress
        fields = (
            "public_id",
            "bingo_id",
            "bingo_title",
            "revision_number",
            "selected_count",
            "updated_at",
        )

    def get_selected_count(self, obj: PlayProgress) -> int:
        return len(obj.selected_cells)


class ProfileSharedResultSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="share_id", read_only=True)
    bingo_id = serializers.UUIDField(source="bingo.public_id", read_only=True)
    bingo_title = serializers.CharField(source="revision.title", read_only=True)
    revision_number = serializers.IntegerField(
        source="revision.revision_number",
        read_only=True,
    )
    selected_count = serializers.SerializerMethodField()
    share_url = serializers.SerializerMethodField()

    class Meta:
        model = SharedResult
        fields = (
            "id",
            "bingo_id",
            "bingo_title",
            "revision_number",
            "selected_count",
            "share_url",
            "created_at",
        )

    def get_selected_count(self, obj: SharedResult) -> int:
        return len(obj.selected_cells)

    def get_share_url(self, obj: SharedResult) -> str:
        return f"/share/{obj.bingo.public_id}/{obj.share_id}"
