from django.urls import path

from apps.media_assets.views import (
    DirectUploadView,
    MediaAssetDetailView,
    MediaContentView,
    UploadCompleteView,
    UploadIntentView,
)

app_name = "media_assets"

urlpatterns = [
    path("media/<uuid:asset_id>/", MediaContentView.as_view(), name="media-content"),
    path("uploads/intents/", UploadIntentView.as_view(), name="upload-intent"),
    path("uploads/<uuid:asset_id>/content/", DirectUploadView.as_view(), name="upload-content"),
    path("uploads/<uuid:asset_id>/complete/", UploadCompleteView.as_view(), name="upload-complete"),
    path("uploads/<uuid:asset_id>/", MediaAssetDetailView.as_view(), name="upload-detail"),
]
