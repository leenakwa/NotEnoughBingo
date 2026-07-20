from rest_framework.exceptions import APIException


class ProgressVersionConflict(APIException):
    status_code = 409
    default_detail = "Progress changed since it was loaded."
    default_code = "progress_version_conflict"


class ShareIdempotencyConflict(APIException):
    status_code = 409
    default_detail = "This idempotency key was already used for different share data."
    default_code = "share_idempotency_conflict"
