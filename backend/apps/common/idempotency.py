from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from apps.common.models import IdempotencyRecord

VALID_KEY = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class IdempotencyConflict(APIException):
    status_code = 409
    default_detail = "This idempotency key is already in use."
    default_code = "idempotency_conflict"


def request_fingerprint(request) -> str:  # type: ignore[no-untyped-def]
    canonical = json.dumps(request.data, sort_keys=True, separators=(",", ":"), default=str)
    payload = f"{request.method}\n{request.path}\n{canonical}".encode()
    return hashlib.sha256(payload).hexdigest()


def idempotency_scope(request) -> str:  # type: ignore[no-untyped-def]
    if request.user.is_authenticated:
        return f"user:{request.user.pk}"
    if not request.session.session_key:
        request.session.save()
    return f"session:{request.session.session_key}"


def execute_idempotent(
    request,  # type: ignore[no-untyped-def]
    operation: Callable[[], Response],
    *,
    required: bool = True,
    ttl: timedelta = timedelta(hours=24),
) -> Response:
    key = request.headers.get("Idempotency-Key", "")
    if not key:
        if required:
            raise ValidationError({"Idempotency-Key": "This header is required."})
        return operation()
    if not VALID_KEY.fullmatch(key):
        raise ValidationError(
            {
                "Idempotency-Key": (
                    "Use 8-128 letters, digits, dots, colons, underscores or hyphens."
                )
            }
        )
    scope = idempotency_scope(request)
    fingerprint = request_fingerprint(request)

    with transaction.atomic():
        record = IdempotencyRecord.objects.select_for_update().filter(key=key, scope=scope).first()
        if record:
            if record.request_hash != fingerprint:
                raise IdempotencyConflict(
                    "The idempotency key was previously used for a different request."
                )
            if record.response_status is None:
                raise IdempotencyConflict("The original request is still being processed.")
            response = Response(record.response_body, status=record.response_status)
            response["Idempotency-Replayed"] = "true"
            return response
        try:
            record = IdempotencyRecord.objects.create(
                key=key,
                scope=scope,
                method=request.method,
                path=request.path,
                request_hash=fingerprint,
                expires_at=timezone.now() + ttl,
            )
        except IntegrityError as exc:
            raise IdempotencyConflict(
                "A concurrent request is using this idempotency key."
            ) from exc

        response = operation()
        if response.status_code >= 500:
            raise RuntimeError("Do not persist server errors as idempotent responses.")
        record.response_status = response.status_code
        record.response_body = _json_safe(response.data)
        record.save(update_fields=("response_status", "response_body", "updated_at"))
        return response


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))
