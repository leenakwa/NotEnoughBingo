from __future__ import annotations

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.analytics.models import InteractionEvent
from apps.analytics.services import record_server_event
from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.social.models import BingoLike, Comment, CommentLike


@transaction.atomic
def like_bingo(*, user: User, bingo) -> bool:  # type: ignore[no-untyped-def]
    try:
        _, created = BingoLike.objects.get_or_create(user=user, bingo=bingo)
    except IntegrityError:
        created = False
    if created:
        type(bingo).objects.filter(pk=bingo.pk).update(like_count=F("like_count") + 1)
        record_server_event(
            event_type=InteractionEvent.Type.LIKE,
            actor=user,
            bingo=bingo,
            revision=bingo.current_revision,
        )
        if bingo.author_id:
            create_notification(
                recipient=bingo.author,
                actor=user,
                notification_type=Notification.Type.BINGO_LIKE,
                bingo=bingo,
                dedupe_key=f"bingo-like:{bingo.pk}:{user.pk}",
            )
    return created


@transaction.atomic
def unlike_bingo(*, user: User, bingo) -> bool:  # type: ignore[no-untyped-def]
    deleted, _ = BingoLike.objects.filter(user=user, bingo=bingo).delete()
    if deleted:
        type(bingo).objects.filter(pk=bingo.pk, like_count__gt=0).update(
            like_count=F("like_count") - 1
        )
        record_server_event(
            event_type=InteractionEvent.Type.UNLIKE,
            actor=user,
            bingo=bingo,
            revision=bingo.current_revision,
        )
    return bool(deleted)


@transaction.atomic
def create_comment(*, user: User, bingo, body: str, parent: Comment | None = None) -> Comment:  # type: ignore[no-untyped-def]
    if parent:
        if parent.bingo_id != bingo.pk:
            raise ValidationError({"parent_id": "The reply belongs to another bingo."})
        if parent.parent_id is not None:
            raise ValidationError({"parent_id": "Replies cannot have nested replies."})
    if Comment.objects.filter(
        bingo=bingo,
        author=user,
        parent=parent,
        body=body,
        deleted_at__isnull=True,
        created_at__gte=timezone.now() - timedelta(seconds=30),
    ).exists():
        raise ValidationError({"body": "Please do not post the same comment repeatedly."})
    comment = Comment.objects.create(bingo=bingo, author=user, parent=parent, body=body)
    type(bingo).objects.filter(pk=bingo.pk).update(comment_count=F("comment_count") + 1)
    record_server_event(
        event_type=InteractionEvent.Type.COMMENT,
        actor=user,
        bingo=bingo,
        revision=bingo.current_revision,
        metadata={"reply": parent is not None},
    )
    if parent:
        Comment.objects.filter(pk=parent.pk).update(reply_count=F("reply_count") + 1)
        create_notification(
            recipient=parent.author,
            actor=user,
            notification_type=Notification.Type.COMMENT_REPLY,
            bingo=bingo,
            comment=comment,
            dedupe_key=f"comment-reply:{comment.pk}",
        )
    elif bingo.author_id:
        create_notification(
            recipient=bingo.author,
            actor=user,
            notification_type=Notification.Type.NEW_COMMENT,
            bingo=bingo,
            comment=comment,
            dedupe_key=f"new-comment:{comment.pk}",
        )
    return comment


@transaction.atomic
def soft_delete_comment(*, user: User, comment: Comment) -> None:
    locked = Comment.objects.select_for_update().get(pk=comment.pk)
    if locked.author_id != user.pk:
        raise ValidationError("You can only delete your own comment.")
    if locked.deleted_at is None:
        locked.deleted_at = timezone.now()
        locked.body = ""
        locked.save(update_fields=("deleted_at", "body", "updated_at"))


@transaction.atomic
def like_comment(*, user: User, comment: Comment) -> bool:
    try:
        _, created = CommentLike.objects.get_or_create(user=user, comment=comment)
    except IntegrityError:
        created = False
    if created:
        Comment.objects.filter(pk=comment.pk).update(like_count=F("like_count") + 1)
        create_notification(
            recipient=comment.author,
            actor=user,
            notification_type=Notification.Type.COMMENT_LIKE,
            bingo=comment.bingo,
            comment=comment,
            dedupe_key=f"comment-like:{comment.pk}:{user.pk}",
        )
    return created


@transaction.atomic
def unlike_comment(*, user: User, comment: Comment) -> bool:
    deleted, _ = CommentLike.objects.filter(user=user, comment=comment).delete()
    if deleted:
        Comment.objects.filter(pk=comment.pk, like_count__gt=0).update(
            like_count=F("like_count") - 1
        )
    return bool(deleted)
