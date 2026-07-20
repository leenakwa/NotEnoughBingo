from rest_framework.exceptions import APIException


class DraftPreconditionRequired(APIException):
    status_code = 428
    default_detail = "Supply the current draft ETag in the If-Match header."
    default_code = "draft_precondition_required"


class DraftVersionConflict(APIException):
    status_code = 412
    default_detail = "The draft changed since it was loaded."
    default_code = "draft_version_conflict"


class IdempotencyConflict(APIException):
    status_code = 409
    default_detail = "This idempotency key was already used for different input."
    default_code = "idempotency_conflict"
