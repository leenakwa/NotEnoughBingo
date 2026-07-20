from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class ActiveAccountBackend(ModelBackend):
    """Keep suspended and deleted accounts out of every Django auth surface."""

    def authenticate(
        self,
        request,
        username=None,
        password=None,
        email=None,
        allow_pending_deletion=False,
        **kwargs,
    ):
        if email is None:
            return super().authenticate(
                request,
                username=username,
                password=password,
                **kwargs,
            )
        if password is None:
            return None
        user_model = get_user_model()
        try:
            user = user_model._default_manager.get(email__iexact=email)
        except user_model.DoesNotExist:
            # Match Django's standard dummy-hash behavior so an unknown email
            # does not create a cheap timing oracle.
            user_model().set_password(password)
            return None
        can_authenticate = self.user_can_authenticate(user) or bool(
            allow_pending_deletion
            and super().user_can_authenticate(user)
            and user.email_verified_at is not None
            and user.suspended_at is None
            and user.deleted_at is None
        )
        if user.check_password(password) and can_authenticate:
            return user
        return None

    def user_can_authenticate(self, user_obj) -> bool:  # type: ignore[no-untyped-def]
        return bool(
            super().user_can_authenticate(user_obj)
            and getattr(user_obj, "email_verified_at", None) is not None
            and getattr(user_obj, "suspended_at", None) is None
            and getattr(user_obj, "deletion_requested_at", None) is None
            and getattr(user_obj, "deleted_at", None) is None
        )
