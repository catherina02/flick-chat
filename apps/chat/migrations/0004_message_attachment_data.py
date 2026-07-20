from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0003_message_attachments_notifications"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="attachment_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="content_type",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
