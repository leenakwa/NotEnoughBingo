from django.urls import path

from apps.moderation import views

urlpatterns = [
    path("reports/", views.ReportCreateView.as_view(), name="report-create"),
    path(
        "moderation/reports/",
        views.ModerationReportListView.as_view(),
        name="moderation-report-list",
    ),
    path(
        "moderation/reports/<uuid:public_id>/",
        views.ModerationReportDetailView.as_view(),
        name="moderation-report-detail",
    ),
    path(
        "moderation/reports/<uuid:public_id>/actions/",
        views.ModerationActionView.as_view(),
        name="moderation-action",
    ),
]
