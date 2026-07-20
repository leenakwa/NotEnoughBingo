from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import StandardPageNumberPagination
from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        queryset = (
            Notification.objects.filter(recipient=self.request.user)
            .select_related(
                "actor",
                "actor__profile",
                "actor__profile__avatar",
                "bingo",
                "comment",
                "comment__bingo",
            )
            .prefetch_related("actor__profile__avatar__derivatives")
        )
        unread = self.request.query_params.get("unread")
        if unread in {"1", "true"}:
            queryset = queryset.filter(is_read=False)
        return queryset


class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=NotificationSerializer)
    def post(self, request, public_id):
        notification = get_object_or_404(Notification, public_id=public_id, recipient=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=("is_read", "read_at", "updated_at"))
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            name="NotificationsReadAllResponse",
            fields={"updated": serializers.IntegerField(min_value=0)},
        ),
    )
    def post(self, request):
        updated = Notification.objects.filter(recipient=request.user, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"updated": updated})


class NotificationUnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name="NotificationUnreadCountResponse",
            fields={"count": serializers.IntegerField(min_value=0)},
        )
    )
    def get(self, request):
        return Response(
            {"count": Notification.objects.filter(recipient=request.user, is_read=False).count()}
        )
