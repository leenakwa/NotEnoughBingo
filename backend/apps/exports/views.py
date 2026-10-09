from __future__ import annotations

import re

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.bingos.models import Bingo
from apps.common.permissions import IsVerifiedUser
from apps.exports.models import ExportJob
from apps.exports.serializers import ExportJobSerializer, ExportRequestSerializer
from apps.exports.services import request_bingo_export

IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class BingoExportCreateView(APIView):
    permission_classes = [IsVerifiedUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "exports"

    @extend_schema(
        request=ExportRequestSerializer,
        parameters=[
            OpenApiParameter(
                name="Idempotency-Key",
                location=OpenApiParameter.HEADER,
                required=True,
                type={"type": "string", "minLength": 8, "maxLength": 128},
                pattern=IDEMPOTENCY_KEY.pattern,
                description="Letters, digits, dots, colons, underscores or hyphens.",
            )
        ],
        responses={
            202: OpenApiResponse(
                ExportJobSerializer,
                description="Accepted export, or the existing job for an identical retry.",
            ),
            400: OpenApiResponse(
                OpenApiTypes.OBJECT,
                description=(
                    "Invalid input, missing/malformed key, or the key was already used for "
                    "a different board, revision or format."
                ),
            ),
        },
    )
    def post(self, request, bingo_id):
        bingo = get_object_or_404(
            Bingo.objects.live(),
            public_id=bingo_id,
            author=request.user,
        )
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = request.headers.get("Idempotency-Key", "")
        if not IDEMPOTENCY_KEY.fullmatch(key):
            raise ValidationError(
                {"idempotency_key": "Use an 8-128 character Idempotency-Key header."}
            )
        job = request_bingo_export(
            user=request.user,
            bingo=bingo,
            output_format=serializer.validated_data["format"],
            idempotency_key=key,
        )
        job = ExportJob.objects.select_related("output_asset").get(pk=job.pk)
        return Response(ExportJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ExportJobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=ExportJobSerializer)
    def get(self, request, export_id):
        job = get_object_or_404(
            ExportJob.objects.select_related("output_asset"),
            public_id=export_id,
            owner=request.user,
        )
        return Response(ExportJobSerializer(job).data)
