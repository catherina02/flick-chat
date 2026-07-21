from django.conf import settings
from django.db import models


class Conversation(models.Model):
    DIRECT = "direct"
    GROUP = "group"
    CHANNEL = "channel"
    TYPE_CHOICES = [
        (DIRECT, "Direct"),
        (GROUP, "Group"),
        (CHANNEL, "Channel"),
    ]

    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=DIRECT)
    name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)
    is_locked = models.BooleanField(default=False)
    canvas_body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        if self.name:
            return self.name
        return f"Conversation({self.pk})"


class ConversationMember(models.Model):
    ADMIN = "admin"
    MEMBER = "member"
    GUEST = "guest"
    ROLE_CHOICES = [
        (ADMIN, "Admin"),
        (MEMBER, "Member"),
        (GUEST, "Guest"),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversation_memberships",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=MEMBER)
    ALL = "all"
    MENTIONS = "mentions"
    MUTE = "mute"
    NOTIFICATION_CHOICES = [
        (ALL, "All messages"),
        (MENTIONS, "Mentions only"),
        (MUTE, "Mute"),
    ]
    notification_level = models.CharField(max_length=10, choices=NOTIFICATION_CHOICES, default=ALL)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("conversation", "user")

    def __str__(self) -> str:
        return f"{self.user_id} in {self.conversation_id}"


class Message(models.Model):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    AUDIO = "audio"
    CARD = "card"
    TYPE_CHOICES = [
        (TEXT, "Text"),
        (IMAGE, "Image"),
        (FILE, "File"),
        (AUDIO, "Audio"),
        (CARD, "Card"),
    ]

    POLL = "poll"
    APPROVAL = "approval"
    CARD_TYPE_CHOICES = [
        (POLL, "Poll"),
        (APPROVAL, "Approval"),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )
    message_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TEXT)
    body = models.TextField(blank=True)
    attachment = models.FileField(
        upload_to="chat_attachments/%Y/%m/",
        blank=True,
        null=True,
    )
    attachment_data = models.BinaryField(blank=True, null=True)
    content_type = models.CharField(max_length=100, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_urgent = models.BooleanField(default=False)
    card_type = models.CharField(max_length=20, choices=CARD_TYPE_CHOICES, blank=True)
    card_data = models.JSONField(default=dict, blank=True)
    transcript = models.TextField(blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def has_attachment(self) -> bool:
        return bool(self.attachment_data) or bool(self.attachment)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Message({self.pk})"


class MessageReaction(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    emoji = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user", "emoji")


class ChannelResource(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="resources",
    )
    title = models.CharField(max_length=255)
    url = models.URLField(blank=True)
    body = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="channel_resources",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class MessageRead(models.Model):
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reads",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="message_reads",
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")

    def __str__(self) -> str:
        return f"Read({self.user_id} on {self.message_id})"


class ScheduledMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="scheduled_messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    body = models.TextField()
    parent = models.ForeignKey(Message, null=True, blank=True, on_delete=models.SET_NULL)
    is_urgent = models.BooleanField(default=False)
    scheduled_at = models.DateTimeField()
    delivered = models.BooleanField(default=False)
    delivered_message = models.ForeignKey(
        Message,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="scheduled_source",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["scheduled_at"]


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_actions",
    )
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=32, blank=True)
    target_id = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Webhook(models.Model):
    INCOMING = "incoming"
    OUTGOING = "outgoing"
    DIRECTION_CHOICES = [(INCOMING, "Incoming"), (OUTGOING, "Outgoing")]

    name = models.CharField(max_length=120)
    url = models.URLField(blank=True)
    secret = models.CharField(max_length=64, unique=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default=OUTGOING)
    events = models.JSONField(default=list, blank=True)
    conversation = models.ForeignKey(
        Conversation,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="webhooks",
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    MESSAGE = "message"
    GROUP = "group"
    TYPE_CHOICES = [
        (MESSAGE, "Message"),
        (GROUP, "Group"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=255)
    body = models.TextField()
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Notification({self.pk}) for {self.user_id}"
