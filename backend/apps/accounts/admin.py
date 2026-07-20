from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    Follow,
    NotificationPreference,
    SecurityEvent,
    SessionMetadata,
    User,
    UserPrivacySettings,
    UserProfile,
)


@admin.register(User)
class AccountAdmin(UserAdmin):
    list_display = (
        "email",
        "username",
        "email_verified_at",
        "is_active",
        "suspended_at",
        "date_joined",
    )
    search_fields = ("email", "username", "public_id")
    readonly_fields = ("public_id", "date_joined", "last_login", "deleted_at")
    fieldsets = (
        *UserAdmin.fieldsets,
        (
            "Not Enough Bingo",
            {
                "fields": (
                    "public_id",
                    "email_verified_at",
                    "suspended_at",
                    "suspension_reason",
                    "deletion_requested_at",
                    "deletion_scheduled_for",
                    "deleted_at",
                )
            },
        ),
    )


admin.site.register(UserProfile)
admin.site.register(UserPrivacySettings)
admin.site.register(NotificationPreference)
admin.site.register(Follow)
admin.site.register(AccountDeletionRequest)


@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = ("email", "purpose", "expires_at", "used_at", "created_at")
    search_fields = ("email", "user__username")
    readonly_fields = ("token_hash", "public_id", "created_at", "updated_at")


@admin.register(SessionMetadata)
class SessionMetadataAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "last_seen_at", "expires_at", "revoked_at")
    search_fields = ("user__email", "user__username", "session_key")
    readonly_fields = ("session_key", "ip_hash", "user_agent", "created_at", "updated_at")


@admin.register(SecurityEvent)
class SecurityEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "user", "created_at")
    list_filter = ("event_type",)
    search_fields = ("user__email", "user__username", "public_id")
    readonly_fields = (
        "public_id",
        "user",
        "event_type",
        "ip_hash",
        "user_agent",
        "metadata",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
