from django.contrib import admin

from apps.social.models import BingoLike, Comment, CommentLike


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = (
        "public_id",
        "bingo",
        "author",
        "parent",
        "like_count",
        "created_at",
        "deleted_at",
        "hidden_at",
    )
    list_filter = ("deleted_at", "hidden_at", "created_at")
    search_fields = ("public_id", "body", "author__username", "bingo__title")
    readonly_fields = ("public_id", "like_count", "reply_count", "created_at", "updated_at")
    raw_id_fields = ("bingo", "author", "parent")


admin.site.register(BingoLike)
admin.site.register(CommentLike)
