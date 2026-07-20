from django.urls import path

from apps.accounts import views

urlpatterns = [
    path(
        "<uuid:public_id>/followers/",
        views.UserFollowView.as_view(),
        name="user-followers",
    ),
]
