from django.contrib import admin

from apps.exports.models import ExportJob


@admin.register(ExportJob)
class ExportJobAdmin(admin.ModelAdmin):
    list_display = (
        "public_id",
        "owner",
        "kind",
        "format",
        "status",
        "created_at",
        "completed_at",
        "expires_at",
    )
    list_filter = ("kind", "format", "status")
    search_fields = ("public_id", "owner__email", "owner__username", "bingo__title")
    readonly_fields = tuple(field.name for field in ExportJob._meta.fields)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
