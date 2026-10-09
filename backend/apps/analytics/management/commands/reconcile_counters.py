from __future__ import annotations

from django.core.management.base import BaseCommand, CommandParser

from apps.analytics.counter_reconciliation import (
    DEFAULT_COUNTER_BATCH_SIZE,
    reconcile_denormalized_counters,
)


class Command(BaseCommand):
    help = "Check or repair authoritative denormalized product counters."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--batch-size",
            type=int,
            default=DEFAULT_COUNTER_BATCH_SIZE,
            help="Maximum rows inspected or updated per batch.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report drift without changing database rows.",
        )

    def handle(self, *args: object, **options: object) -> None:
        dry_run = bool(options["dry_run"])
        result = reconcile_denormalized_counters(
            batch_size=int(options["batch_size"]),
            dry_run=dry_run,
        )
        action = "would repair" if dry_run else "repaired"
        self.stdout.write(
            self.style.SUCCESS(
                f"Counter reconciliation {action}: "
                f"{result['bingos']} bingos, {result['comments']} comments, "
                f"{result['tags']} tags."
            )
        )
