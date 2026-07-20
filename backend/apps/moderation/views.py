from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.pagination import StandardPageNumberPagination
from apps.common.permissions import IsModerator
from apps.moderation.models import Report
from apps.moderation.serializers import (
    ModerationActionRequestSerializer,
    ModerationActionSerializer,
    ReportCreateSerializer,
    ReportSerializer,
)
from apps.moderation.services import apply_moderation_action, create_report


class ReportCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reports"

    @extend_schema(
        request=ReportCreateSerializer,
        responses={
            201: inline_serializer(
                name="ReportCreatedResponse",
                fields={
                    "report_id": serializers.UUIDField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        serializer = ReportCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        report = create_report(
            reporter=request.user,
            target_type=serializer.validated_data["target_type"],
            target=serializer.validated_data["target"],
            reason=serializer.validated_data["reason"],
            description=serializer.validated_data.get("description", ""),
        )
        return Response(
            {"report_id": str(report.public_id), "status": report.status},
            status=status.HTTP_201_CREATED,
        )


class ModerationReportListView(generics.ListAPIView):
    permission_classes = [IsModerator]
    serializer_class = ReportSerializer
    pagination_class = StandardPageNumberPagination
    filterset_fields = ("status", "target_type", "reason", "assigned_moderator")
    ordering_fields = ("created_at", "updated_at", "resolved_at")
    ordering = ("created_at",)

    def get_queryset(self):
        return Report.objects.select_related(
            "reporter", "assigned_moderator", "bingo", "comment", "profile"
        ).prefetch_related("status_history__changed_by", "actions__moderator")


class ModerationReportDetailView(generics.RetrieveAPIView):
    permission_classes = [IsModerator]
    serializer_class = ReportSerializer
    lookup_field = "public_id"

    def get_queryset(self):
        return Report.objects.select_related(
            "reporter", "assigned_moderator", "bingo", "comment", "profile"
        ).prefetch_related("status_history__changed_by", "actions__moderator")


class ModerationActionView(APIView):
    permission_classes = [IsModerator]

    @extend_schema(
        request=ModerationActionRequestSerializer,
        responses={201: ModerationActionSerializer},
    )
    def post(self, request, public_id):
        report = get_object_or_404(Report, public_id=public_id)
        serializer = ModerationActionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = apply_moderation_action(
            report=report,
            moderator=request.user,
            action=serializer.validated_data["action"],
            reason=serializer.validated_data["reason"],
        )
        return Response(
            ModerationActionSerializer(action).data,
            status=status.HTTP_201_CREATED,
        )
