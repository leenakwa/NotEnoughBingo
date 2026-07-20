from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.bingos.models import Bingo
from apps.bingos.services import create_bingo, publish_bingo
from apps.bingos.validators import empty_draft_document


@dataclass(frozen=True)
class SeedAuthor:
    email: str
    username: str
    display_name: str


@dataclass(frozen=True)
class SeedBingo:
    author: str
    title: str
    description: str
    size: int
    visibility: str
    marking_style: str
    tags: tuple[str, ...]
    cells: tuple[str, ...]


AUTHORS = (
    SeedAuthor("alex@example.test", "alex_makes", "Alex"),
    SeedAuthor("mira@example.test", "mira_notes", "Mira"),
)

BINGOS = (
    SeedBingo(
        author="alex_makes",
        title="Small wins this week",
        description="A gentle board for noticing the things that went right.",
        size=3,
        visibility=Bingo.Visibility.PUBLIC,
        marking_style=Bingo.MarkingStyle.CHECKMARK,
        tags=("wellbeing", "weekly"),
        cells=(
            "Took a proper break",
            "Finished a task I avoided",
            "Went outside",
            "Asked for help",
            "Made something",
            "Called someone I miss",
            "Cooked a meal",
            "Learned one new thing",
            "Went to bed on time",
        ),
    ),
    SeedBingo(
        author="mira_notes",
        title="A curious weekend",
        description="Ideas for a weekend with a little more attention and play.",
        size=4,
        visibility=Bingo.Visibility.PUBLIC,
        marking_style=Bingo.MarkingStyle.HIGHLIGHT,
        tags=("weekend", "inspiration"),
        cells=(
            "Visit a new street",
            "Read outside",
            "Try a new recipe",
            "Take a slow morning",
            "Write one page",
            "See live music",
            "Make a tiny gift",
            "Leave the phone behind",
            "Photograph a detail",
            "Talk to a neighbour",
            "Repair something",
            "Watch the sunset",
            "Browse a bookshop",
            "Draw without judging",
            "Take a long walk",
            "Plan nothing for an hour",
        ),
    ),
    SeedBingo(
        author="alex_makes",
        title="Creative courage",
        description="Private-by-link prompts for making imperfect work.",
        size=3,
        visibility=Bingo.Visibility.UNLISTED,
        marking_style=Bingo.MarkingStyle.CROSSOUT,
        tags=("creativity",),
        cells=(
            "Share a rough draft",
            "Use an unfamiliar tool",
            "Ask for critique",
            "Make the obvious version",
            "Delete a favourite detail",
            "Work for fifteen minutes",
            "Publish before perfect",
            "Copy a technique to learn it",
            "Start again on purpose",
        ),
    ),
)


class Command(BaseCommand):
    help = "Create deterministic local-development users and bingo content."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--password",
            default=os.getenv("DEV_SEED_PASSWORD", "LocalDevPassword!123"),
            help="Password assigned to local seed users.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_dev is intentionally disabled unless DEBUG=true.")

        password = options["password"]
        if len(password) < 12:
            raise CommandError("The seed password must contain at least 12 characters.")

        authors: dict[str, User] = {}
        for spec in AUTHORS:
            user, created = User.objects.get_or_create(
                email=spec.email,
                defaults={"username": spec.username},
            )
            if user.username != spec.username:
                raise CommandError(f"{spec.email} already belongs to username {user.username!r}.")
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.is_active = True
            user.set_password(password)
            user.save(
                update_fields=(
                    "password",
                    "email_verified_at",
                    "is_active",
                )
            )
            user.profile.display_name = spec.display_name
            user.profile.save(update_fields=("display_name", "updated_at"))
            authors[spec.username] = user
            self.stdout.write(f"{'Created' if created else 'Updated'} user {spec.email}")

        created_count = 0
        for spec in BINGOS:
            author = authors[spec.author]
            if Bingo.objects.filter(
                author=author,
                title=spec.title,
                deleted_at__isnull=True,
            ).exists():
                continue
            document = empty_draft_document(title=spec.title, size=spec.size)
            document.update(
                {
                    "description": spec.description,
                    "visibility": spec.visibility,
                    "marking_style": spec.marking_style,
                    "tags": list(spec.tags),
                }
            )
            for cell, text in zip(document["cells"], spec.cells, strict=True):
                cell["text"] = text
            bingo = create_bingo(author=author, document=document)
            publish_bingo(
                bingo=bingo,
                actor=author,
                idempotency_key=f"seed-dev-{uuid.uuid5(uuid.NAMESPACE_URL, spec.title)}",
            )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Development seed is ready ({created_count} new bingos). "
                f"Login with either seed email and the configured seed password."
            )
        )
