from __future__ import annotations

import json
import os
from typing import Any

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    AccountDeletionRequest,
    EmailVerification,
    Follow,
    SecurityEvent,
    SessionMetadata,
    User,
)
from apps.analytics.models import BingoDailyMetric, InteractionEvent
from apps.bingos.models import Bingo, Draft, Tag
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document
from apps.common.models import IdempotencyRecord
from apps.exports.models import ExportJob
from apps.moderation.models import ModerationAction, Report
from apps.notifications.models import Notification
from apps.plays.models import PlayProgress, SharedResult
from apps.plays.services import create_shared_result
from apps.social.models import BingoLike, Comment, CommentLike

FIXTURE_PREFIX = "E2E "
FIXTURE_EMAILS = (
    "e2e-author@example.test",
    "e2e-player@example.test",
    "e2e-moderator@example.test",
)


def _document(
    *,
    title: str,
    visibility: str,
    cells: tuple[str, ...],
    marking_style: str = Bingo.MarkingStyle.CHECKMARK,
) -> dict[str, Any]:
    document = empty_draft_document(title=title, size=3)
    document.update(
        {
            "description": f"{title} is deterministic browser-test content.",
            "visibility": visibility,
            "marking_style": marking_style,
            "tags": ["e2e", visibility],
        }
    )
    if len(cells) != len(document["cells"]):
        raise CommandError(f"{title!r} must define exactly {len(document['cells'])} cells.")
    for cell, text in zip(document["cells"], cells, strict=True):
        cell["text"] = text
    return document


def _delete_fixture_state(users: list[User]) -> None:
    user_ids = [user.pk for user in users]
    profile_ids = [user.profile.pk for user in users]
    bingos = Bingo.objects.filter(Q(author_id__in=user_ids) | Q(title__startswith=FIXTURE_PREFIX))
    bingo_ids = list(bingos.values_list("pk", flat=True))
    comments = Comment.objects.filter(Q(author_id__in=user_ids) | Q(bingo_id__in=bingo_ids))
    comment_ids = list(comments.values_list("pk", flat=True))
    reports = Report.objects.filter(
        Q(reporter_id__in=user_ids)
        | Q(assigned_moderator_id__in=user_ids)
        | Q(bingo_id__in=bingo_ids)
        | Q(comment_id__in=comment_ids)
        | Q(profile_id__in=profile_ids)
    )
    report_ids = list(reports.values_list("pk", flat=True))

    ModerationAction.objects.filter(
        Q(report_id__in=report_ids) | Q(moderator_id__in=user_ids)
    ).delete()
    reports.delete()
    Notification.objects.filter(
        Q(recipient_id__in=user_ids)
        | Q(actor_id__in=user_ids)
        | Q(bingo_id__in=bingo_ids)
        | Q(comment_id__in=comment_ids)
    ).delete()
    ExportJob.objects.filter(Q(owner_id__in=user_ids) | Q(bingo_id__in=bingo_ids)).delete()
    SharedResult.objects.filter(Q(owner_id__in=user_ids) | Q(bingo_id__in=bingo_ids)).delete()
    PlayProgress.objects.filter(Q(user_id__in=user_ids) | Q(bingo_id__in=bingo_ids)).delete()
    InteractionEvent.objects.filter(Q(actor_id__in=user_ids) | Q(bingo_id__in=bingo_ids)).delete()
    BingoDailyMetric.objects.filter(bingo_id__in=bingo_ids).delete()
    CommentLike.objects.filter(Q(user_id__in=user_ids) | Q(comment_id__in=comment_ids)).delete()
    BingoLike.objects.filter(Q(user_id__in=user_ids) | Q(bingo_id__in=bingo_ids)).delete()
    comments.delete()
    Follow.objects.filter(Q(follower_id__in=user_ids) | Q(following_id__in=user_ids)).delete()
    Draft.objects.filter(bingo_id__in=bingo_ids).delete()
    bingos.delete()

    AccountDeletionRequest.objects.filter(user_id__in=user_ids).delete()
    EmailVerification.objects.filter(user_id__in=user_ids).delete()
    SecurityEvent.objects.filter(user_id__in=user_ids).delete()
    session_keys = list(
        SessionMetadata.objects.filter(user_id__in=user_ids).values_list(
            "session_key",
            flat=True,
        )
    )
    Session.objects.filter(session_key__in=session_keys).delete()
    SessionMetadata.objects.filter(user_id__in=user_ids).delete()
    IdempotencyRecord.objects.filter(
        Q(key__startswith="e2e-fixture-")
        | Q(scope__in=[f"share:user:{user_id}" for user_id in user_ids])
    ).delete()

    for tag in Tag.objects.filter(slug__in=("e2e", "public", "unlisted", "private")):
        tag.usage_count = tag.bingo_links.count()
        tag.save(update_fields=("usage_count", "updated_at"))


def _upsert_user(
    *,
    email: str,
    username: str,
    display_name: str,
    password: str,
    moderator: bool = False,
) -> User:
    conflicting = User.objects.filter(username__iexact=username).exclude(email__iexact=email)
    if conflicting.exists():
        raise CommandError(f"The E2E username {username!r} belongs to a different account.")
    user, _ = User.objects.get_or_create(
        email=email,
        defaults={"username": username},
    )
    user.username = username
    user.is_active = True
    user.is_staff = moderator
    user.is_superuser = moderator
    user.email_verified_at = timezone.now()
    user.suspended_at = None
    user.suspension_reason = ""
    user.deletion_requested_at = None
    user.deletion_scheduled_for = None
    user.deleted_at = None
    user.set_password(password)
    user.save()
    user.profile.display_name = display_name
    user.profile.bio = f"{display_name} browser-test account."
    user.profile.avatar = None
    user.profile.save(update_fields=("display_name", "bio", "avatar", "updated_at"))
    privacy = user.privacy
    for field in (
        "show_bio",
        "show_created_bingos",
        "show_play_history",
        "show_shared_results",
        "show_followers",
        "show_following",
    ):
        setattr(privacy, field, True)
    privacy.save()
    return user


class Command(BaseCommand):
    help = "Reset and create deterministic fixtures for the live Playwright suite."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--json",
            action="store_true",
            help="Write the fixture manifest as a single JSON object.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "")
        if not (settings.DEBUG or settings_module.endswith(".test")):
            raise CommandError("seed_e2e is disabled outside DEBUG and test settings.")
        if os.environ.get("E2E_LIVE") != "1":
            raise CommandError("Set E2E_LIVE=1 explicitly before resetting E2E fixtures.")
        password = os.environ.get("E2E_FIXTURE_PASSWORD", "")
        if len(password) < 12:
            raise CommandError("E2E_FIXTURE_PASSWORD must contain at least 12 characters.")

        stale_signup_users = list(
            User.objects.filter(
                Q(email__startswith="e2e-signup-") | Q(username__startswith="e2e_signup_")
            )
        )
        existing_users = list(User.objects.filter(email__in=FIXTURE_EMAILS))
        _delete_fixture_state([*existing_users, *stale_signup_users])
        if stale_signup_users:
            User.objects.filter(pk__in=[user.pk for user in stale_signup_users]).delete()
        cache.clear()

        author = _upsert_user(
            email=FIXTURE_EMAILS[0],
            username="e2e_author",
            display_name="E2E Author",
            password=password,
        )
        player = _upsert_user(
            email=FIXTURE_EMAILS[1],
            username="e2e_player",
            display_name="E2E Player",
            password=password,
        )
        moderator = _upsert_user(
            email=FIXTURE_EMAILS[2],
            username="e2e_moderator",
            display_name="E2E Moderator",
            password=password,
            moderator=True,
        )

        fixture_specs = {
            "public": {
                "title": "E2E Public Board",
                "visibility": Bingo.Visibility.PUBLIC,
                "marking_style": Bingo.MarkingStyle.CHECKMARK,
                "cells": (
                    "Morning stretch",
                    "Made the bed",
                    "Drank water",
                    "Took a walk",
                    "Called a friend",
                    "Read ten pages",
                    "Cooked dinner",
                    "No-phone hour",
                    "Early bedtime",
                ),
            },
            "unlisted": {
                "title": "E2E Unlisted Board",
                "visibility": Bingo.Visibility.UNLISTED,
                "marking_style": Bingo.MarkingStyle.CROSSOUT,
                "cells": (
                    "Share a draft",
                    "Ask for feedback",
                    "Try new tools",
                    "Sketch an idea",
                    "Make a mistake",
                    "Keep it simple",
                    "Finish one thing",
                    "Show the process",
                    "Publish today",
                ),
            },
            "private": {
                "title": "E2E Private Board",
                "visibility": Bingo.Visibility.PRIVATE,
                "marking_style": Bingo.MarkingStyle.HIGHLIGHT,
                "cells": (
                    "Quiet morning",
                    "Deep breath",
                    "Clear the desk",
                    "Write it down",
                    "Take a pause",
                    "Close one tab",
                    "Drink some tea",
                    "Stretch gently",
                    "Rest well",
                ),
            },
            "revision": {
                "title": "E2E Revision Board",
                "visibility": Bingo.Visibility.PUBLIC,
                "marking_style": Bingo.MarkingStyle.CHECKMARK,
                "cells": (
                    "Fresh coffee",
                    "Sunny window",
                    "Favorite song",
                    "Kind message",
                    "Warm shower",
                    "Good news",
                    "Quiet moment",
                    "Tasty lunch",
                    "Clean sheets",
                ),
            },
        }
        bingos: dict[str, dict[str, Any]] = {}
        bingo_rows: dict[str, Bingo] = {}
        for key, spec in fixture_specs.items():
            bingo = create_bingo(
                author=author,
                document=_document(
                    title=spec["title"],
                    visibility=spec["visibility"],
                    cells=spec["cells"],
                    marking_style=spec["marking_style"],
                ),
            )
            revision = publish_bingo(
                bingo=bingo,
                actor=author,
                idempotency_key=f"e2e-fixture-publish-{key}",
            )
            bingo.refresh_from_db()
            bingo_rows[key] = bingo
            cells = list(revision.cells.order_by("position"))
            bingos[key] = {
                "id": str(bingo.public_id),
                "title": revision.title,
                "visibility": revision.visibility,
                "revision_id": str(revision.public_id),
                "revision_number": revision.revision_number,
                "cell_ids": [str(cell.public_id) for cell in cells],
                "cell_texts": [cell.text for cell in cells],
            }

        revision_bingo = bingo_rows["revision"]
        revision = revision_bingo.current_revision
        assert revision is not None
        snapshot = create_shared_result(
            bingo=revision_bingo,
            revision_id=revision.public_id,
            selected_cells=bingos["revision"]["cell_ids"][:2],
            display_name=player.profile.display_name,
            idempotency_key="e2e-fixture-revision-share",
            actor=player,
        )

        manifest = {
            "schema_version": 1,
            "users": {
                "author": {
                    "id": str(author.public_id),
                    "email": author.email,
                    "username": author.username,
                    "display_name": author.profile.display_name,
                },
                "player": {
                    "id": str(player.public_id),
                    "email": player.email,
                    "username": player.username,
                    "display_name": player.profile.display_name,
                },
                "moderator": {
                    "id": str(moderator.public_id),
                    "email": moderator.email,
                    "username": moderator.username,
                    "display_name": moderator.profile.display_name,
                },
            },
            "bingos": bingos,
            "revision_snapshot": {
                "bingo_id": str(revision_bingo.public_id),
                "share_id": snapshot.share_id,
                "title": revision.title,
                "revision_number": revision.revision_number,
                "selected_cells": list(snapshot.selected_cells),
            },
        }
        rendered = json.dumps(manifest, sort_keys=True)
        if options["json"]:
            self.stdout.write(rendered)
        else:
            self.stdout.write(self.style.SUCCESS("Live E2E fixtures are ready."))
            self.stdout.write(rendered)
