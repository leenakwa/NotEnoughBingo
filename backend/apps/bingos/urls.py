from django.urls import include, path
from rest_framework.routers import SimpleRouter

from apps.bingos.views import (
    AuthorSuggestionListView,
    BingoArchiveView,
    BingoDraftView,
    BingoPublishView,
    BingoRestoreView,
    BingoRevisionListView,
    BingoViewSet,
    DraftListView,
    PublicSitemapView,
    TagListView,
)

app_name = "bingos"

router = SimpleRouter()
router.register("bingos", BingoViewSet, basename="bingo")

urlpatterns = [
    path("", include(router.urls)),
    path("authors/", AuthorSuggestionListView.as_view(), name="author-suggestion-list"),
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("sitemap/bingos/", PublicSitemapView.as_view(), name="public-sitemap-bingos"),
    path("drafts/", DraftListView.as_view(), name="draft-list"),
    path("bingos/<uuid:bingo_id>/draft/", BingoDraftView.as_view(), name="bingo-draft"),
    path("bingos/<uuid:bingo_id>/publish/", BingoPublishView.as_view(), name="bingo-publish"),
    path(
        "bingos/<uuid:bingo_id>/revisions/",
        BingoRevisionListView.as_view(),
        name="bingo-revisions",
    ),
    path("bingos/<uuid:bingo_id>/archive/", BingoArchiveView.as_view(), name="bingo-archive"),
    path("bingos/<uuid:bingo_id>/restore/", BingoRestoreView.as_view(), name="bingo-restore"),
]
