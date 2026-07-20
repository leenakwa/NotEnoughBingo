from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("media_assets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediaasset",
            name="processing_task_id",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
