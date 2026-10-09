from rest_framework.exceptions import APIException


class AccountDeletionConflict(APIException):
    status_code = 409
    default_detail = "Only a scheduled account deletion can be cancelled."
    default_code = "account_deletion_conflict"
