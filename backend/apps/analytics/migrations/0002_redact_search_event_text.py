from django.db import migrations

REDACTION_BATCH_SIZE = 500
SAFE_METADATA_KEYS = frozenset(("surface", "ordering"))


def redact_search_event_text(apps, schema_editor) -> None:
    InteractionEvent = apps.get_model("analytics", "InteractionEvent")
    database = schema_editor.connection.alias
    last_pk = 0
    while True:
        events = list(
            InteractionEvent.objects.using(database)
            .filter(event_type="search", pk__gt=last_pk)
            .only("id", "query", "metadata")
            .order_by("pk")[:REDACTION_BATCH_SIZE]
        )
        if not events:
            break
        last_pk = events[-1].pk
        batch = []
        for event in events:
            metadata = event.metadata if isinstance(event.metadata, dict) else {}
            safe_metadata = {
                key: value for key, value in metadata.items() if key in SAFE_METADATA_KEYS
            }
            if not event.query and safe_metadata == metadata:
                continue
            event.query = ""
            event.metadata = safe_metadata
            batch.append(event)
        if batch:
            InteractionEvent.objects.using(database).bulk_update(
                batch, ("query", "metadata"), batch_size=REDACTION_BATCH_SIZE
            )


class Migration(migrations.Migration):
    atomic = False
    dependencies = [("analytics", "0001_initial")]

    operations = [migrations.RunPython(redact_search_event_text, migrations.RunPython.noop)]
