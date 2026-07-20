from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common import health

API_V1 = "api/v1/"

urlpatterns = [
    path("admin/", admin.site.urls),
    path(f"{API_V1}health/live/", health.live, name="health-live"),
    path(f"{API_V1}health/ready/", health.ready, name="health-ready"),
    path(
        f"{API_V1}schema/",
        SpectacularAPIView.as_view(),
        name="api-schema",
    ),
    path(
        f"{API_V1}docs/",
        SpectacularSwaggerView.as_view(url_name="api-schema"),
        name="api-docs",
    ),
    path(f"{API_V1}auth/", include("apps.accounts.urls")),
    path(f"{API_V1}profiles/", include("apps.accounts.profile_urls")),
    path(f"{API_V1}users/", include("apps.accounts.user_urls")),
    path(API_V1, include("apps.bingos.urls")),
    path(API_V1, include("apps.media_assets.urls")),
    path(API_V1, include("apps.plays.urls")),
    path(API_V1, include("apps.exports.urls")),
    path(API_V1, include("apps.social.urls")),
    path(f"{API_V1}notifications/", include("apps.notifications.urls")),
    path(API_V1, include("apps.analytics.urls")),
    path(API_V1, include("apps.moderation.urls")),
]
