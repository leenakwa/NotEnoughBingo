from django.urls import path

from apps.analytics import views

urlpatterns = [
    path("interactions/", views.InteractionBatchView.as_view(), name="interaction-batch"),
    path("feeds/trending/", views.TrendingFeedView.as_view(), name="trending-feed"),
    path("feeds/discover/", views.DiscoverFeedView.as_view(), name="discover-feed"),
]
