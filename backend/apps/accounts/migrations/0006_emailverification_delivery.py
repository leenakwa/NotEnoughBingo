from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_security_event_email_changed")]

    operations = [
        migrations.AddField(
            model_name="emailverification",
            name="delivery",
            field=models.JSONField(blank=True, db_default={}, default=dict),
        ),
    ]
