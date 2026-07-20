from django.contrib import admin

from apps.plays.models import PlayProgress, SharedResult


@admin.register(PlayProgress)
class PlayProgressAdmin(admin.ModelAdmin):
    list_display = ("user", "bingo", "revision", "version", "updated_at", "reset_at")
    search_fields = ("user__email", "user__username", "bingo__title", "public_id")
    readonly_fields = (
        "public_id",
        "user",
        "bingo",
        "revision",
        "selected_cells",
        "version",
        "created_at",
        "updated_at",
        "reset_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(SharedResult)
class SharedResultAdmin(admin.ModelAdmin):
    list_display = (
        "share_id",
        "bingo",
        "owner_display_name",
        "access",
        "created_at",
        "hidden_at",
        "revoked_at",
    )
    list_filter = ("access", "hidden_at", "revoked_at")
    search_fields = ("share_id", "bingo__title", "owner__email", "owner_display_name")
    readonly_fields = (
        "public_id",
        "share_id",
        "bingo",
        "revision",
        "owner",
        "owner_display_name",
        "guest_session_hash",
        "selected_cells",
        "access",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
