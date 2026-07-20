from rest_framework import serializers

from apps.exports.models import ExportJob


class ExportRequestSerializer(serializers.Serializer):
    format = serializers.ChoiceField(choices=(ExportJob.Format.PNG, ExportJob.Format.PDF))


class ExportJobSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    download_url = serializers.SerializerMethodField()
    error = serializers.CharField(source="error_code", read_only=True)

    class Meta:
        model = ExportJob
        fields = (
            "id",
            "public_id",
            "kind",
            "format",
            "status",
            "download_url",
            "error",
            "created_at",
            "completed_at",
            "expires_at",
        )

    def get_download_url(self, obj: ExportJob) -> str | None:
        if obj.status != ExportJob.Status.READY or not obj.output_asset_id:
            return None
        return f"/api/v1/media/{obj.output_asset.public_id}/"
