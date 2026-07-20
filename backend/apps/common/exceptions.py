from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException, ErrorDetail
from rest_framework.response import Response
from rest_framework.views import exception_handler


def _normalize_details(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _normalize_details(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_details(item) for item in value]
    if isinstance(value, ErrorDetail):
        return {"message": str(value), "code": value.code}
    return value


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None:
        return None
    request = context.get("request")
    code = "validation_error" if response.status_code == status.HTTP_400_BAD_REQUEST else "error"
    message = "The request could not be processed."
    if isinstance(exc, APIException):
        code = getattr(exc, "default_code", code)
        if isinstance(exc.detail, ErrorDetail):
            message = str(exc.detail)
    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": _normalize_details(response.data),
            "request_id": getattr(request, "request_id", None),
        }
    }
    return response
