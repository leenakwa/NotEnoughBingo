from __future__ import annotations

import logging

from django.test import Client, override_settings
from django.urls import path
from rest_framework.views import APIView


class FailingAPIView(APIView):
    def get(self, request):
        raise RuntimeError("internal database detail")


urlpatterns = [path("api/v1/force-error/", FailingAPIView.as_view())]


def test_unhandled_api_error_is_logged_and_hidden_from_public_response(caplog) -> None:
    logger = logging.getLogger("django.request")
    logger.addHandler(caplog.handler)
    try:
        with override_settings(ROOT_URLCONF=__name__, DEBUG=False):
            with caplog.at_level(logging.ERROR, logger="django.request"):
                response = Client(raise_request_exception=False).get(
                    "/api/v1/force-error/", HTTP_X_REQUEST_ID="error-correlation-id"
                )
    finally:
        logger.removeHandler(caplog.handler)

    assert response.status_code == 500
    assert response["X-Request-ID"] == "error-correlation-id"
    assert b"internal database detail" not in response.content
    assert b"Traceback" not in response.content
    assert any(
        record.name == "django.request" and record.levelno >= logging.ERROR
        for record in caplog.records
    )
