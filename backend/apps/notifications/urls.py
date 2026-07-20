from django.urls import path

from apps.notifications import views

urlpatterns = [
    path("", views.NotificationListView.as_view(), name="notification-list"),
    path("unread-count/", views.NotificationUnreadCountView.as_view(), name="unread-count"),
    path("read-all/", views.NotificationReadAllView.as_view(), name="read-all"),
    path("<uuid:public_id>/read/", views.NotificationReadView.as_view(), name="notification-read"),
]
