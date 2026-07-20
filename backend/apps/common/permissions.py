from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsVerifiedUser(BasePermission):
    message = "A verified email address is required."

    def has_permission(self, request, view) -> bool:  # type: ignore[no-untyped-def]
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.email_verified_at
            and request.user.suspended_at is None
            and request.user.deletion_requested_at is None
            and request.user.deleted_at is None
        )


class IsOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj) -> bool:  # type: ignore[no-untyped-def]
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user.is_authenticated and obj.author_id == request.user.id)


class IsModerator(BasePermission):
    def has_permission(self, request, view) -> bool:  # type: ignore[no-untyped-def]
        return bool(
            request.user.is_authenticated
            and request.user.is_active
            and request.user.suspended_at is None
            and request.user.deletion_requested_at is None
            and request.user.deleted_at is None
            and request.user.has_perm("moderation.moderate_content")
            and request.user.has_perm("moderation.view_private_content")
        )
