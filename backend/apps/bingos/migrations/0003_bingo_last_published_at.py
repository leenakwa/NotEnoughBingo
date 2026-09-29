from django.db import migrations, models


def repair_published_snapshots(apps, schema_editor) -> None:
    Bingo = apps.get_model("bingos", "Bingo")
    BingoRevision = apps.get_model("bingos", "BingoRevision")
    first_publications = {
        row["bingo_id"]: row["first_published_at"]
        for row in BingoRevision.objects.values("bingo_id").annotate(
            first_published_at=models.Min("published_at")
        )
    }
    repaired = []
    for bingo in (
        Bingo.objects.filter(current_revision__isnull=False)
        .select_related("current_revision")
        .iterator(chunk_size=500)
    ):
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
        repaired.append(bingo)
        if len(repaired) == 500:
            Bingo.objects.bulk_update(
                repaired,
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
            repaired.clear()
    if repaired:
        Bingo.objects.bulk_update(
            repaired,
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
