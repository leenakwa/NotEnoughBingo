from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import IntegrityError, close_old_connections, connection, transaction
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Follow
from apps.accounts.views import UserFollowView
from apps.notifications.models import Notification
from apps.social.models import BingoLike, CommentLike
from apps.social.services import (
    create_comment,
    like_bingo,
    like_comment,
    soft_delete_comment,
    unlike_bingo,
    unlike_comment,
)

pytestmark = pytest.mark.django_db


def test_follow_constraints_prevent_duplicates_and_self_follow(user_factory) -> None:
    follower = user_factory()
    author = user_factory()
    Follow.objects.create(follower=follower, following=author)

    with pytest.raises(IntegrityError), transaction.atomic():
        Follow.objects.create(follower=follower, following=author)

    with pytest.raises(IntegrityError), transaction.atomic():
        Follow.objects.create(follower=follower, following=follower)


def test_follow_endpoint_is_idempotent_and_emits_one_notification(user_factory) -> None:
    follower = user_factory()
    author = user_factory()
    factory = APIRequestFactory()

    def follow():
        request = factory.post(f"/api/v1/users/{author.public_id}/followers/")
        force_authenticate(request, user=follower)
        return UserFollowView.as_view()(request, public_id=author.public_id)

    first = follow()
    second = follow()

    assert first.status_code == 201
    assert second.status_code == 200
    assert Follow.objects.filter(follower=follower, following=author).count() == 1
    assert (
        Notification.objects.filter(
            recipient=author,
            actor=follower,
            notification_type=Notification.Type.NEW_FOLLOWER,
        ).count()
        == 1
    )

    request = factory.delete(f"/api/v1/users/{author.public_id}/followers/")
    force_authenticate(request, user=follower)
    response = UserFollowView.as_view()(request, public_id=author.public_id)
    assert response.status_code == 204
    assert not Follow.objects.filter(follower=follower, following=author).exists()


def test_follow_endpoint_rejects_self_follow(user_factory) -> None:
    user = user_factory()
    request = APIRequestFactory().post(f"/api/v1/users/{user.public_id}/followers/")
    force_authenticate(request, user=user)

    response = UserFollowView.as_view()(request, public_id=user.public_id)

    assert response.status_code == 400
    assert not Follow.objects.filter(follower=user, following=user).exists()


def test_bingo_like_services_are_idempotent_and_keep_counter_consistent(
    user_factory,
    bingo_factory,
) -> None:
    author = user_factory()
    actor = user_factory()
    bingo = bingo_factory(author=author, like_count=0)

    assert like_bingo(user=actor, bingo=bingo) is True
    assert like_bingo(user=actor, bingo=bingo) is False
    bingo.refresh_from_db()
    assert bingo.like_count == 1
    assert BingoLike.objects.filter(user=actor, bingo=bingo).count() == 1
    assert (
        Notification.objects.filter(
            recipient=author,
            actor=actor,
            notification_type=Notification.Type.BINGO_LIKE,
        ).count()
        == 1
    )

    assert unlike_bingo(user=actor, bingo=bingo) is True
    assert unlike_bingo(user=actor, bingo=bingo) is False
    bingo.refresh_from_db()
    assert bingo.like_count == 0


def test_bingo_self_like_does_not_notify_author(user_factory, bingo_factory) -> None:
    author = user_factory()
    bingo = bingo_factory(author=author)

    assert like_bingo(user=author, bingo=bingo) is True

    assert not Notification.objects.filter(recipient=author).exists()


def test_comment_service_enforces_one_reply_level_and_updates_counters(
    user_factory,
    bingo_factory,
) -> None:
    board_author = user_factory()
    root_author = user_factory()
    reply_author = user_factory()
    bingo = bingo_factory(author=board_author, comment_count=0)

    root = create_comment(user=root_author, bingo=bingo, body="Root")
    reply = create_comment(user=reply_author, bingo=bingo, body="Reply", parent=root)

    bingo.refresh_from_db()
    root.refresh_from_db()
    assert bingo.comment_count == 2
    assert root.reply_count == 1
    assert Notification.objects.filter(
        recipient=board_author,
        actor=root_author,
        notification_type=Notification.Type.NEW_COMMENT,
        comment=root,
    ).exists()
    assert Notification.objects.filter(
        recipient=root_author,
        actor=reply_author,
        notification_type=Notification.Type.COMMENT_REPLY,
        comment=reply,
    ).exists()

    with pytest.raises(ValidationError, match="nested replies"):
        create_comment(user=board_author, bingo=bingo, body="Nested", parent=reply)


def test_comment_service_rejects_parent_from_another_bingo(
    user_factory,
    bingo_factory,
    comment_factory,
) -> None:
    actor = user_factory()
    first_bingo = bingo_factory()
    second_bingo = bingo_factory()
    root = comment_factory(bingo=first_bingo)

    with pytest.raises(ValidationError, match="another bingo"):
        create_comment(user=actor, bingo=second_bingo, body="Wrong board", parent=root)


def test_soft_delete_preserves_thread_and_rejects_non_author(
    user_factory,
    bingo_factory,
) -> None:
    root_author = user_factory()
    other_user = user_factory()
    bingo = bingo_factory()
    root = create_comment(user=root_author, bingo=bingo, body="Root")
    reply = create_comment(user=other_user, bingo=bingo, body="Reply", parent=root)

    with pytest.raises(ValidationError, match="your own comment"):
        soft_delete_comment(user=other_user, comment=root)

    soft_delete_comment(user=root_author, comment=root)
    root.refresh_from_db()
    reply.refresh_from_db()
    assert root.deleted_at is not None
    assert root.body == ""
    assert root.display_body == "[deleted]"
    assert reply.parent_id == root.pk
    assert reply.deleted_at is None


def test_comment_like_services_are_idempotent_and_never_underflow(
    user_factory,
    comment_factory,
) -> None:
    actor = user_factory()
    comment = comment_factory(like_count=0)

    assert like_comment(user=actor, comment=comment) is True
    assert like_comment(user=actor, comment=comment) is False
    comment.refresh_from_db()
    assert comment.like_count == 1
    assert CommentLike.objects.filter(user=actor, comment=comment).count() == 1
    assert (
        Notification.objects.filter(
            recipient=comment.author,
            actor=actor,
            notification_type=Notification.Type.COMMENT_LIKE,
        ).count()
        == 1
    )

    assert unlike_comment(user=actor, comment=comment) is True
    assert unlike_comment(user=actor, comment=comment) is False
    comment.refresh_from_db()
    assert comment.like_count == 0


@pytest.mark.concurrency
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Thread-level uniqueness/counter race semantics require PostgreSQL.",
)
@pytest.mark.django_db(transaction=True)
def test_concurrent_duplicate_bingo_likes_create_one_row_and_one_count(
    user_factory,
    bingo_factory,
) -> None:
    user = user_factory()
    bingo = bingo_factory(like_count=0)
    barrier = Barrier(2)

    def worker() -> bool:
        close_old_connections()
        try:
            worker_user = type(user).objects.get(pk=user.pk)
            worker_bingo = type(bingo).objects.get(pk=bingo.pk)
            barrier.wait(timeout=5)
            return like_bingo(user=worker_user, bingo=worker_bingo)
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: worker(), range(2)))

    bingo.refresh_from_db()
    assert sorted(results) == [False, True]
    assert BingoLike.objects.filter(user=user, bingo=bingo).count() == 1
    assert bingo.like_count == 1


@pytest.mark.concurrency
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Thread-level unique-follow race semantics require PostgreSQL.",
)
@pytest.mark.django_db(transaction=True)
def test_concurrent_follow_get_or_create_creates_one_row(user_factory) -> None:
    follower = user_factory()
    target = user_factory()
    barrier = Barrier(2)

    def worker() -> bool:
        close_old_connections()
        try:
            local_follower = type(follower).objects.get(pk=follower.pk)
            local_target = type(target).objects.get(pk=target.pk)
            barrier.wait(timeout=5)
            _, created = Follow.objects.get_or_create(
                follower=local_follower,
                following=local_target,
            )
            return created
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: worker(), range(2)))

    assert sorted(results) == [False, True]
    assert Follow.objects.filter(follower=follower, following=target).count() == 1


def _comment_context(comment, viewer=None):
    from apps.social.views import CommentContextView

    request = APIRequestFactory().get(f"/api/v1/comments/{comment.public_id}/context/")
    if viewer is not None:
        force_authenticate(request, user=viewer)
    return CommentContextView.as_view()(request, comment_id=comment.public_id)


def test_comment_context_restores_nested_target_without_list_pagination(
    user_factory, comment_factory
) -> None:
    reader = user_factory()
    root = comment_factory(body="Original parent")
    for _ in range(30):
        comment_factory(bingo=root.bingo)
    reply = comment_factory(bingo=root.bingo, parent=root, body="Target reply")
    CommentLike.objects.create(user=reader, comment=reply)
    response = _comment_context(reply, reader)
    assert response.status_code == 200
    assert str(response.data["bingo_id"]) == str(root.bingo.public_id)
    assert str(response.data["comment"]["id"]) == str(reply.public_id)
    assert response.data["comment"]["body"] == "Target reply"
    assert response.data["comment"]["is_liked"] is True
    assert str(response.data["parent"]["id"]) == str(root.public_id)
    assert response.data["parent"]["body"] == "Original parent"


@pytest.mark.parametrize("restriction", ["private", "draft", "archived", "deleted", "hidden"])
def test_comment_context_does_not_bypass_board_access(
    restriction, user_factory, bingo_factory, comment_factory
) -> None:
    from django.utils import timezone

    reader = user_factory()
    bingo = bingo_factory()
    if restriction == "private":
        bingo.visibility = "private"
    elif restriction in {"draft", "archived"}:
        bingo.status = restriction
    else:
        setattr(bingo, f"{restriction}_at", timezone.now())
    bingo.save()
    comment = comment_factory(bingo=bingo)
    assert _comment_context(comment, reader).status_code == 404


def test_comment_context_requires_sign_in_and_allows_private_board_owner(
    bingo_factory, comment_factory
) -> None:
    bingo = bingo_factory(visibility="private")
    comment = comment_factory(bingo=bingo)
    assert _comment_context(comment).status_code == 401
    assert _comment_context(comment, bingo.author).status_code == 200


@pytest.mark.parametrize("hidden_parent", [False, True])
def test_comment_context_does_not_expose_moderated_comment_text(
    hidden_parent, user_factory, comment_factory
) -> None:
    from django.utils import timezone

    root = comment_factory(body="Parent private moderation text")
    reply = comment_factory(bingo=root.bingo, parent=root, body="Reply private moderation text")
    target = root if hidden_parent else reply
    target.hidden_at = timezone.now()
    target.save(update_fields=["hidden_at"])
    assert _comment_context(reply, user_factory()).status_code == 404


def test_comment_context_returns_deleted_tombstone_without_original_text(
    user_factory, comment_factory
) -> None:
    from django.utils import timezone

    comment = comment_factory(body="Removed confidential content", deleted_at=timezone.now())
    response = _comment_context(comment, user_factory())
    assert response.status_code == 200
    assert response.data["comment"]["body"] == "[deleted]"
    assert response.data["comment"]["deleted_at"] is not None
    assert response.data["parent"] is None
