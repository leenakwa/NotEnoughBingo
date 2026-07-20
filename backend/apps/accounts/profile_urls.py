from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("me/", views.ProfileMeView.as_view(), name="profile-me"),
    path("privacy/", views.PrivacyView.as_view(), name="privacy"),
    path("me/privacy/", views.PrivacyView.as_view(), name="profile-me-privacy"),
    path(
        "notification-preferences/",
        views.NotificationPreferenceView.as_view(),
        name="notification-preferences",
    ),
    path(
        "<str:username>/bingos/",
        views.ProfileBingoListView.as_view(),
        name="profile-bingos",
    ),
    path(
        "<str:username>/play-history/",
        views.ProfilePlayHistoryView.as_view(),
        name="profile-play-history",
    ),
    path(
        "<str:username>/shared-results/",
        views.ProfileSharedResultListView.as_view(),
        name="profile-shared-results",
    ),
    path(
        "<str:username>/followers/",
        views.ProfileFollowerListView.as_view(),
        name="profile-followers",
    ),
    path(
        "<str:username>/following/",
        views.ProfileFollowingListView.as_view(),
        name="profile-following",
    ),
    path("<str:username>/", views.PublicProfileView.as_view(), name="public-profile"),
    path("<str:username>/follow/", views.FollowView.as_view(), name="follow"),
]
