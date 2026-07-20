from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.notifications.views import (
    NotificationReadAllView,
    NotificationReadView,
    NotificationUnreadCountView,
)

pytestmark = pytest.mark.django_db


def test_notification_creation_deduplicates_and_respects_preferences(user_factory) -> None:
    recipient = user_factory()
    actor = user_factory()

    first = create_notification(
        recipient=recipient,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="follow:actor:recipient",
    )
    second = create_notification(
        recipient=recipient,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="follow:actor:recipient",
    )

    assert first is not None
    assert second == first
    assert Notification.objects.filter(recipient=recipient).count() == 1

    recipient.notification_preferences.new_follower = False
    recipient.notification_preferences.save()
    suppressed = create_notification(
        recipient=recipient,
        actor=user_factory(),
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="follow:another:recipient",
    )
    assert suppressed is None
    assert Notification.objects.filter(recipient=recipient).count() == 1


def test_notification_creation_suppresses_self_events_and_bounds_dedupe_key(user_factory) -> None:
    user = user_factory()

    assert (
        create_notification(
            recipient=user,
            actor=user,
            notification_type=Notification.Type.BINGO_LIKE,
            dedupe_key="self-like",
        )
        is None
    )

    notification = create_notification(
        recipient=user,
        actor=None,
        notification_type=Notification.Type.BINGO_LIKE,
        dedupe_key="x" * 500,
    )
    assert notification is not None
    assert len(notification.dedupe_key) == 190


def test_read_endpoints_only_mutate_current_users_notifications(user_factory) -> None:
    user = user_factory()
    other = user_factory()
    actor = user_factory()
    own_first = create_notification(
        recipient=user,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="own-first",
    )
    own_second = create_notification(
        recipient=user,
        actor=other,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="own-second",
    )
    foreign = create_notification(
        recipient=other,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="foreign",
    )
    assert own_first is not None
    assert own_second is not None
    assert foreign is not None
    factory = APIRequestFactory()

    foreign_request = factory.post(f"/api/v1/notifications/{foreign.public_id}/read/")
    force_authenticate(foreign_request, user=user)
    foreign_response = NotificationReadView.as_view()(
        foreign_request,
        public_id=foreign.public_id,
    )
    assert foreign_response.status_code == 404

    own_request = factory.post(f"/api/v1/notifications/{own_first.public_id}/read/")
    force_authenticate(own_request, user=user)
    own_response = NotificationReadView.as_view()(
        own_request,
        public_id=own_first.public_id,
    )
    assert own_response.status_code == 200
    own_first.refresh_from_db()
    assert own_first.is_read is True
    assert own_first.read_at is not None

    read_all_request = factory.post("/api/v1/notifications/read-all/")
    force_authenticate(read_all_request, user=user)
    read_all_response = NotificationReadAllView.as_view()(read_all_request)
    assert read_all_response.status_code == 200
    assert read_all_response.data == {"updated": 1}

    own_second.refresh_from_db()
    foreign.refresh_from_db()
    assert own_second.is_read is True
    assert foreign.is_read is False


def test_unread_count_is_scoped_to_current_user(user_factory) -> None:
    user = user_factory()
    other = user_factory()
    actor = user_factory()
    create_notification(
        recipient=user,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="one",
    )
    create_notification(
        recipient=user,
        actor=other,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="two",
    )
    create_notification(
        recipient=other,
        actor=actor,
        notification_type=Notification.Type.NEW_FOLLOWER,
        dedupe_key="foreign",
    )
    request = APIRequestFactory().get("/api/v1/notifications/unread-count/")
    force_authenticate(request, user=user)

    response = NotificationUnreadCountView.as_view()(request)

    assert response.status_code == 200
    assert response.data == {"count": 2}
