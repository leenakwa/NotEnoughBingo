from __future__ import annotations

import logging
import re

import sentry_sdk
from django.core.exceptions import RequestDataTooBig
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.common.error_tracking import BROWSER_ERROR_KINDS, BROWSER_ERROR_TYPES, BROWSER_SURFACES

logger = logging.getLogger("app.browser")


class ClosedSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - set(self.fields):
            raise serializers.ValidationError({"non_field_errors": ["Unknown report fields."]})
        return super().to_internal_value(data)


class BrowserFrameSerializer(ClosedSerializer):
    filename = serializers.RegexField(
        r"^/_next/static/chunks/[A-Za-z0-9_./-]+\.js$", max_length=240
    )
    lineno = serializers.IntegerField(min_value=1, max_value=10_000_000)
    colno = serializers.IntegerField(min_value=1, max_value=10_000_000)

    def validate_filename(self, value):
        if any(part in {".", "..", ""} for part in value.split("/")[1:]):
            raise serializers.ValidationError("Invalid chunk location.")
        return value


class BrowserErrorSerializer(ClosedSerializer):
    kind = serializers.ChoiceField(choices=BROWSER_ERROR_KINDS)
    error_type = serializers.ChoiceField(choices=BROWSER_ERROR_TYPES)
    surface = serializers.ChoiceField(choices=BROWSER_SURFACES)
    status_code = serializers.IntegerField(min_value=0, max_value=599, required=False)
    # DRF supports max_length on many=True; the installed stubs omit that keyword.
    frames = BrowserFrameSerializer(many=True, max_length=8, required=False)  # type: ignore[call-arg]


class ClientErrorView(APIView):
    """Accept bounded diagnostics; never accept messages, URLs or user content."""

    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]
    throttle_classes = [ScopedRateThrottle, AnonRateThrottle, UserRateThrottle]
    throttle_scope = "client_errors"

    @extend_schema(
        request=BrowserErrorSerializer,
        responses={204: None},
        parameters=[
            OpenApiParameter(
                name="X-NEB-Client-Release",
                type=str,
                location=OpenApiParameter.HEADER,
                required=False,
                description=(
                    "Full lowercase Git SHA embedded in the loaded frontend bundle. "
                    "Absent or malformed values are recorded as frontend-unknown. "
                    "Untrusted diagnostic metadata; never used for authorization."
                ),
            )
        ],
    )
    def post(self, request):
        length = request.META.get("CONTENT_LENGTH", "")
        if length.isdecimal() and (len(length) > 10 or int(length) > 4096):
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        try:
            if len(request.body) > 4096:
                return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except RequestDataTooBig:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        serializer = BrowserErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.validated_data
        # Treat client metadata as untrusted. Legacy tabs have no known release;
        # they must not inherit the version of the backend receiving the report.
        client_release = request.headers.get("X-NEB-Client-Release", "")
        release = (
            f"frontend-{client_release}"
            if re.fullmatch(r"[a-f0-9]{40}", client_release)
            else "frontend-unknown"
        )
        logger.info(
            "browser.error",
            extra={
                "exception_type": report["error_type"],
                "outcome": report["kind"],
                "route": report["surface"],
                "status_code": report.get("status_code"),
            },
        )
        sentry_sdk.capture_event(
            {
                # The event protocol supports JavaScript; Python SDK stubs restrict this literal.
                "platform": "javascript",  # type: ignore[typeddict-item]
                "level": "error",
                "logger": "app.browser",
                "release": release,
                "contexts": {
                    "browser_error": {
                        key: report[key]
                        for key in ("kind", "surface", "status_code")
                        if key in report
                    }
                },
                "exception": {
                    "values": [
                        {
                            "type": report["error_type"],
                            "value": "Exception details omitted",
                            "mechanism": {
                                "type": report["kind"],
                                "handled": report["kind"] in {"boundary", "api"},
                            },
                            "stacktrace": {
                                "frames": [
                                    {**frame, "in_app": True}
                                    for frame in reversed(report.get("frames", []))
                                ]
                            },
                        }
                    ]
                },
            }
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
