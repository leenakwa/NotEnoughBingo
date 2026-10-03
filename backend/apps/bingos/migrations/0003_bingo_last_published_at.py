from django.db import migrations, models

REPAIR_BATCH_SIZE = 500


def repair_published_snapshots(apps, schema_editor) -> None:
    Bingo = apps.get_model("bingos", "Bingo")
    BingoRevision = apps.get_model("bingos", "BingoRevision")

    def repair_batch(batch) -> None:
        first_publications = {
            row["bingo_id"]: row["first_published_at"]
            for row in BingoRevision.objects.filter(bingo_id__in=[bingo.pk for bingo in batch])
            .values("bingo_id")
            .annotate(first_published_at=models.Min("published_at"))
        }
        for bingo in batch:
            revision = bingo.current_revision
            bingo.title = revision.title
            bingo.description = revision.description
            bingo.size = revision.size
            bingo.visibility = revision.visibility
            bingo.marking_style = revision.marking_style
            bingo.marking_config = revision.marking_config
            bingo.cover_id = revision.cover_id
            bingo.background_id = revision.background_id
            bingo.published_at = first_publications.get(bingo.pk, revision.published_at)
            bingo.last_published_at = revision.published_at
        Bingo.objects.bulk_update(
            batch,
            fields=(
                "title",
                "description",
                "size",
                "visibility",
                "marking_style",
                "marking_config",
                "cover",
                "background",
                "published_at",
                "last_published_at",
            ),
        )

    batch = []
    for bingo in (
        Bingo.objects.filter(current_revision__isnull=False)
        .select_related("current_revision")
        .iterator(chunk_size=REPAIR_BATCH_SIZE)
    ):
        batch.append(bingo)
        if len(batch) == REPAIR_BATCH_SIZE:
            repair_batch(batch)
            batch.clear()
    if batch:
        repair_batch(batch)


class Migration(migrations.Migration):
    dependencies = [
        ("bingos", "0002_draftmediaasset"),
    ]

    operations = [
        migrations.AddField(
            model_name="bingo",
            name="last_published_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(repair_published_snapshots, migrations.RunPython.noop),
    ]
