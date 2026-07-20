from django.contrib import admin

from apps.bingos.models import (
    Bingo,
    BingoCell,
    BingoRevision,
    BingoRevisionTag,
    BingoTag,
    Draft,
    Tag,
)


class BingoTagInline(admin.TabularInline):
    model = BingoTag
    extra = 0
    autocomplete_fields = ("tag",)


@admin.register(Bingo)
class BingoAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "author",
        "status",
        "visibility",
        "size",
        "published_at",
        "hidden_at",
    )
    list_filter = ("status", "visibility", "marking_style", "hidden_at")
    search_fields = ("title", "author__email", "author__username", "public_id")
    readonly_fields = (
        "public_id",
        "current_revision",
        "view_count",
        "like_count",
        "comment_count",
        "play_count",
        "share_count",
        "trending_score",
        "trending_score_updated_at",
        "created_at",
        "updated_at",
        "published_at",
        "deleted_at",
    )
    inlines = (BingoTagInline,)


@admin.register(Draft)
class DraftAdmin(admin.ModelAdmin):
    list_display = ("bingo", "version", "schema_version", "saved_by", "updated_at")
    search_fields = ("bingo__title", "bingo__public_id", "saved_by__email")
    readonly_fields = (
        "public_id",
        "bingo",
        "based_on_revision",
        "document",
        "schema_version",
        "version",
        "saved_by",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


class BingoCellInline(admin.TabularInline):
    model = BingoCell
    extra = 0
    can_delete = False
    show_change_link = False
    readonly_fields = tuple(field.name for field in BingoCell._meta.fields)

    def has_add_permission(self, request, obj=None) -> bool:
        return False


class BingoRevisionTagInline(admin.TabularInline):
    model = BingoRevisionTag
    extra = 0
    can_delete = False
    readonly_fields = ("tag", "name", "slug", "position")

    def has_add_permission(self, request, obj=None) -> bool:
        return False


@admin.register(BingoRevision)
class BingoRevisionAdmin(admin.ModelAdmin):
    list_display = ("bingo", "revision_number", "visibility", "published_by", "published_at")
    list_filter = ("visibility", "marking_style")
    search_fields = ("bingo__title", "bingo__public_id", "public_id")
    readonly_fields = tuple(field.name for field in BingoRevision._meta.fields)
    inlines = (BingoRevisionTagInline, BingoCellInline)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "usage_count", "hidden_at")
    list_filter = ("hidden_at",)
    search_fields = ("name", "slug")
    readonly_fields = ("public_id", "usage_count", "created_at", "updated_at")
