from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("chat", "0005_message_edit_delete"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversation",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="conversation",
            name="is_public",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="conversation",
            name="type",
            field=models.CharField(
                choices=[("direct", "Direct"), ("group", "Group"), ("channel", "Channel")],
                default="direct",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="conversationmember",
            name="role",
            field=models.CharField(
                choices=[("admin", "Admin"), ("member", "Member"), ("guest", "Guest")],
                default="member",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="is_urgent",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="replies",
                to="chat.message",
            ),
        ),
        migrations.CreateModel(
            name="MessageReaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("emoji", models.CharField(max_length=32)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "message",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reactions", to="chat.message"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"unique_together": {("message", "user", "emoji")}},
        ),
        migrations.CreateModel(
            name="ChannelResource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("url", models.URLField(blank=True)),
                ("body", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "conversation",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="resources", to="chat.conversation"),
                ),
                (
                    "created_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="channel_resources", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
