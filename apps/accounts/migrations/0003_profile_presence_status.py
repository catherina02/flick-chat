from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_devicetoken"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="presence_status",
            field=models.CharField(default="online", max_length=20),
        ),
        migrations.AddField(
            model_name="profile",
            name="status_message",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
