from django.urls import path

from apps.plays.views import ProgressView, SharedResultCreateView, SharedResultDetailView

app_name = "plays"

urlpatterns = [
    path("progress/<uuid:bingo_id>/", ProgressView.as_view(), name="progress"),
    path(
        "bingos/<uuid:bingo_id>/shares/",
        SharedResultCreateView.as_view(),
        name="share-create",
    ),
    path(
        "shares/<uuid:bingo_id>/<str:share_id>/",
        SharedResultDetailView.as_view(),
        name="share-detail",
    ),
]
