from django.urls import path

from apps.exports.views import BingoExportCreateView, ExportJobDetailView

app_name = "exports"

urlpatterns = [
    path(
        "bingos/<uuid:bingo_id>/exports/",
        BingoExportCreateView.as_view(),
        name="bingo-export-create",
    ),
    path("exports/<uuid:export_id>/", ExportJobDetailView.as_view(), name="export-detail"),
]
