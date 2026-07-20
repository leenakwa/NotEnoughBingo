from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import (
    NotificationPreference,
    User,
    UserPrivacySettings,
    UserProfile,
)


@receiver(post_save, sender=User)
def create_account_relations(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    UserProfile.objects.get_or_create(user=instance)
    UserPrivacySettings.objects.get_or_create(user=instance)
    NotificationPreference.objects.get_or_create(user=instance)
