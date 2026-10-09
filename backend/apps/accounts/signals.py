from __future__ import annotations

from django.contrib.auth.signals import user_logged_out
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import (
    NotificationPreference,
    User,
    UserPrivacySettings,
    UserProfile,
)


@receiver(user_logged_out)
def record_explicit_logout(sender, request, **kwargs) -> None:
    if request is not None:
        # API views pass a DRF wrapper; middleware sees its Django request.
        django_request = getattr(request, "_request", request)
        django_request._neb_explicit_logout = True


@receiver(post_save, sender=User)
def create_account_relations(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    UserProfile.objects.get_or_create(user=instance)
    UserPrivacySettings.objects.get_or_create(user=instance)
    NotificationPreference.objects.get_or_create(user=instance)
