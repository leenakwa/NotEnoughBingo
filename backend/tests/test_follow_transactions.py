from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Follow
from apps.analytics.models import InteractionEvent
from apps.notifications.models import Notification

pytestmark = pytest.mark.integration


def _client(user=None) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    if user is not None:
        client.force_login(user)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    client.credentials(HTTP_X_CSRFTOKEN=response.data["csrf"])
    return client


def _follow_url(target, route: str) -> str:
    if route == "username":
        return f"/api/v1/profiles/{target.username}/follow/"
    return f"/api/v1/users/{target.public_id}/followers/"


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("route", ["username", "public_id"])
@pytest.mark.parametrize(
    ("failure_model", "failure_field"),
    [(Notification, "dedupe_key"), (InteractionEvent, "event_type")],
    ids=["notification-write", "analytics-write"],
)
def test_follow_sql_failure_rolls_back_all_records_and_retry_creates_them_once(
    verified_user_factory, route: str, failure_model, failure_field: str
) -> None:
    follower = verified_user_factory()
    target = verified_user_factory()
    assert target.notification_preferences.new_follower is True
    client = _client(follower)
    client.raise_request_exception = False
    url = _follow_url(target, route)
    original_save = failure_model.save

    def fail_required_field_write(instance, *args, **kwargs):
        # Exercise the real SQL NOT NULL constraint at a late write, after the
        # preceding records have already been inserted by the API handler.
        setattr(instance, failure_field, None)
        return original_save(instance, *args, **kwargs)

    with patch.object(
        failure_model,
        "save",
        autospec=True,
        side_effect=fail_required_field_write,
    ) as failed_write:
        rejected = client.post(url)

    assert rejected.status_code == 500
    failed_write.assert_called_once()
    follows = Follow.objects.filter(follower=follower, following=target)
    notifications = Notification.objects.filter(
        recipient=target,
        actor=follower,
        notification_type=Notification.Type.NEW_FOLLOWER,
    )
    events = InteractionEvent.objects.filter(
        actor=follower,
        event_type=InteractionEvent.Type.FOLLOW,
    )
    assert not follows.exists()
    assert not notifications.exists()
    assert not events.exists()

    retried = client.post(url)

    assert retried.status_code == 201
    assert retried.data == {"following": True}
    follow = follows.get()
    notification = notifications.get()
    event = events.get()
    assert notification.follow_id == follow.pk
    assert notification.dedupe_key == f"follow:{follower.pk}:{target.pk}"
    assert event.source == InteractionEvent.Source.SERVER
    assert event.metadata == {"target_user_id": str(target.public_id)}
    # Both API forms share the same relationship and must remain idempotent.
    other_route = "public_id" if route == "username" else "username"
    duplicate = client.post(_follow_url(target, other_route))

    assert duplicate.status_code == 200
    assert duplicate.data == {"following": True}
    assert follows.count() == notifications.count() == events.count() == 1
    assert follows.get().pk == follow.pk
    assert notifications.get().pk == notification.pk
    assert events.get().pk == event.pk


@pytest.mark.django_db
@pytest.mark.parametrize("route", ["username", "public_id"])
def test_follow_permissions_and_self_follow_rejection_create_no_records(
    verified_user_factory, route: str
) -> None:
    user = verified_user_factory()
    url = _follow_url(user, route)

    anonymous = _client().post(url)
    self_follow = _client(user).post(url)

    assert anonymous.status_code == 401
    assert self_follow.status_code == 400
    error_field = "username" if route == "username" else "user"
    assert self_follow.data["error"]["details"][error_field] == {
        "message": "You cannot follow yourself.",
        "code": "invalid",
    }
    assert not Follow.objects.exists()
    assert not Notification.objects.exists()
    assert not InteractionEvent.objects.filter(event_type=InteractionEvent.Type.FOLLOW).exists()
