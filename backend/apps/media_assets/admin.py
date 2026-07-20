from django.contrib import admin

from apps.media_assets.models import MediaAsset


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = (
        "public_id",
        "owner",
        "kind",
        "variant",
        "status",
        "byte_size",
        "created_at",
        "ready_at",
    )
    list_filter = ("kind", "variant", "status")
    search_fields = ("public_id", "owner__email", "owner__username", "checksum_sha256")
    readonly_fields = (
        "public_id",
        "owner",
        "kind",
        "variant",
        "parent",
        "storage_key",
        "storage_bucket",
        "declared_mime",
        "detected_mime",
        "expected_size",
        "byte_size",
        "expected_checksum_sha256",
        "checksum_sha256",
        "width",
        "height",
        "created_at",
        "updated_at",
        "uploaded_at",
        "processing_task_id",
        "ready_at",
        "deleted_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
