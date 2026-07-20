from django.contrib import admin

from apps.analytics.models import BingoDailyMetric, InteractionEvent


@admin.register(InteractionEvent)
class InteractionEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "actor", "bingo", "occurred_at", "received_at")
    list_filter = ("event_type", "occurred_at")
    search_fields = ("actor__username", "bingo__title", "query", "public_id")
    readonly_fields = (
        "public_id",
        "actor",
        "anonymous_id_hash",
        "client_event_id",
        "event_type",
        "bingo",
        "revision",
        "tag",
        "query",
        "metadata",
        "occurred_at",
        "received_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(BingoDailyMetric)
