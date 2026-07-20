from django.contrib import admin, messages

from apps.moderation.models import ModerationAction, Report, ReportStatusHistory
from apps.moderation.services import apply_moderation_action


class StatusHistoryInline(admin.TabularInline):
    model = ReportStatusHistory
    extra = 0
    can_delete = False
    readonly_fields = ("from_status", "to_status", "changed_by", "note", "created_at")

    def has_add_permission(self, request, obj=None):
        return False


class ModerationActionInline(admin.TabularInline):
    model = ModerationAction
    extra = 0
    can_delete = False
    readonly_fields = (
        "public_id",
        "moderator",
        "action",
        "target_type",
        "target_public_id",
        "reason",
        "metadata",
        "created_at",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = (
        "public_id",
        "target_type",
        "reason",
        "status",
        "reporter",
        "assigned_moderator",
        "created_at",
    )
    list_filter = ("status", "target_type", "reason", "created_at")
    search_fields = (
        "public_id",
        "reporter__username",
        "description",
        "context_snapshot",
    )
    readonly_fields = (
        "public_id",
        "reporter",
        "target_type",
        "bingo",
        "comment",
        "profile",
        "reason",
        "description",
        "context_snapshot",
        "created_at",
        "updated_at",
    )
    inlines = (StatusHistoryInline, ModerationActionInline)
    actions = (
        "hide_reported_content",
        "restore_reported_content",
        "soft_delete_reported_content",
        "suspend_reported_user",
        "unsuspend_reported_user",
        "resolve_without_action",
        "dismiss_reports",
    )

    def has_view_permission(self, request, obj=None):
        return bool(
            super().has_view_permission(request, obj)
            and request.user.has_perm("moderation.view_private_content")
        )

    def has_change_permission(self, request, obj=None):
        return bool(
            super().has_change_permission(request, obj)
            and request.user.has_perm("moderation.moderate_content")
        )

    def _apply_action(self, request, queryset, *, action, reason):
        count = 0
        for report in queryset:
            try:
                apply_moderation_action(
                    report=report,
                    moderator=request.user,
                    action=action,
                    reason=reason,
                )
                count += 1
            except Exception as exc:
                self.message_user(request, str(exc), level=messages.ERROR)
        self.message_user(request, f"Processed {count} report(s).")

    @admin.action(description="Hide reported content")
    def hide_reported_content(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.HIDE,
            reason="Hidden through Django Admin",
        )

    @admin.action(description="Restore reported content")
    def restore_reported_content(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.RESTORE,
            reason="Restored through Django Admin",
        )

    @admin.action(description="Soft-delete reported content")
    def soft_delete_reported_content(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.SOFT_DELETE,
            reason="Soft-deleted through Django Admin",
        )

    @admin.action(description="Suspend reported user")
    def suspend_reported_user(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.SUSPEND_USER,
            reason="Suspended through Django Admin",
        )

    @admin.action(description="Unsuspend reported user")
    def unsuspend_reported_user(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.UNSUSPEND_USER,
            reason="Unsuspended through Django Admin",
        )

    @admin.action(description="Resolve without action")
    def resolve_without_action(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.RESOLVE_NO_ACTION,
            reason="Resolved without action through Django Admin",
        )

    @admin.action(description="Dismiss reports")
    def dismiss_reports(self, request, queryset):
        self._apply_action(
            request,
            queryset,
            action=ModerationAction.Action.DISMISS,
            reason="Dismissed through Django Admin",
        )


@admin.register(ModerationAction)
class ModerationActionAdmin(admin.ModelAdmin):
    list_display = ("action", "target_type", "target_public_id", "moderator", "created_at")
    list_filter = ("action", "target_type", "created_at")
    search_fields = ("target_public_id", "moderator__username", "reason")
    readonly_fields = (
        "public_id",
        "report",
        "moderator",
        "action",
        "target_type",
        "target_public_id",
        "reason",
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
