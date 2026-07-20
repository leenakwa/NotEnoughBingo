from __future__ import annotations

from typing import Any

from apps.accounts.models import User
from apps.notifications.models import Notification

PREFERENCE_FIELD: dict[str, str] = {
    Notification.Type.NEW_COMMENT: "new_comment",
    Notification.Type.COMMENT_REPLY: "comment_reply",
    Notification.Type.BINGO_LIKE: "bingo_like",
    Notification.Type.COMMENT_LIKE: "comment_like",
    Notification.Type.NEW_FOLLOWER: "new_follower",
}


def create_notification(
    *,
    recipient: User,
    actor: User | None,
    notification_type: str,
    dedupe_key: str,
    **relations: Any,
) -> Notification | None:
    if actor and actor.pk == recipient.pk:
        return None
    preference_field = PREFERENCE_FIELD[notification_type]
    preferences = recipient.notification_preferences
    if not getattr(preferences, preference_field):
        return None
    notification, _ = Notification.objects.get_or_create(
        recipient=recipient,
        dedupe_key=dedupe_key[:190],
        defaults={
            "actor": actor,
            "notification_type": notification_type,
            **relations,
        },
    )
    return notification
