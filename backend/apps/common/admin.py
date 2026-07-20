from django.contrib import admin

from apps.common.models import IdempotencyRecord


@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ("key", "scope", "method", "path", "response_status", "expires_at")
    search_fields = ("key", "scope", "path")
    readonly_fields = (
        "key",
        "scope",
        "method",
        "path",
        "request_hash",
        "response_status",
        "response_body",
        "created_at",
        "updated_at",
        "expires_at",
    )
