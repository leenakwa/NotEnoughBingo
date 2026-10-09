from django.utils import timezone
from rest_framework import serializers

from apps.exports.models import ExportJob


class ExportRequestSerializer(serializers.Serializer):
    format = serializers.ChoiceField(choices=(ExportJob.Format.PNG, ExportJob.Format.PDF))


class ExportJobSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    download_url = serializers.SerializerMethodField()
    error = serializers.SerializerMethodField()

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

    def get_error(self, obj: ExportJob) -> str:
        if not obj.error_code:
            return ""
        return {
            "temporary_storage_error": (
                "The export service is temporarily unavailable. Please try again shortly."
            ),
            "worker_interrupted": "The export was interrupted. Please request a new export.",
            "export_failed": "The export could not be prepared. Please try again.",
            "export_expired": "This export has expired. Please request a new export.",
        }.get(obj.error_code, "The export could not be prepared. Please try again.")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if (
            instance.expires_at
            and instance.expires_at <= timezone.now()
            and instance.status
            in (
                ExportJob.Status.QUEUED,
                ExportJob.Status.PROCESSING,
                ExportJob.Status.READY,
            )
        ):
            data["status"] = ExportJob.Status.EXPIRED
            data["download_url"] = None
            data["error"] = "This export has expired. Please request a new export."
        return data
