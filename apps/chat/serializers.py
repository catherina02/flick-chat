from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import (
    AuditLog,
    ChannelResource,
    Conversation,
    ConversationMember,
    Message,
    MessageReaction,
    Notification,
    ScheduledMessage,
    Webhook,
)

User = get_user_model()


class ReactionSummarySerializer(serializers.Serializer):
    emoji = serializers.CharField()
    count = serializers.IntegerField()
    reacted = serializers.BooleanField()


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    read_by = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    reply_count = serializers.SerializerMethodField()
    parent_id = serializers.IntegerField(source="parent_id", read_only=True, allow_null=True)

    class Meta:
        model = Message
        fields = (
            "id",
            "conversation",
            "parent_id",
            "sender",
            "message_type",
            "body",
            "attachment_url",
            "file_name",
            "file_size",
            "is_deleted",
            "is_pinned",
            "is_urgent",
            "card_type",
            "card_data",
            "transcript",
            "edited_at",
            "created_at",
            "read_by",
            "reactions",
            "reply_count",
        )
        read_only_fields = fields

    def get_read_by(self, obj):
        return list(obj.reads.exclude(user_id=obj.sender_id).values_list("user_id", flat=True))

    def get_attachment_url(self, obj):
        if not obj.has_attachment:
            return None
        from django.conf import settings
        from django.urls import reverse

        path = reverse("chat-message-attachment", kwargs={"message_id": obj.id})
        request = self.context.get("request")
        if request is not None:
            url = request.build_absolute_uri(path)
            auth = request.META.get("HTTP_AUTHORIZATION", "")
            if auth.startswith("Bearer "):
                url = f"{url}?token={auth[7:]}"
            return url
        return f"{settings.SITE_URL.rstrip('/')}{path}"

    def get_reactions(self, obj):
        request = self.context.get("request")
        user_id = request.user.id if request and request.user.is_authenticated else None
        grouped: dict[str, dict] = {}
        for reaction in obj.reactions.all():
            entry = grouped.setdefault(reaction.emoji, {"emoji": reaction.emoji, "count": 0, "reacted": False})
            entry["count"] += 1
            if user_id and reaction.user_id == user_id:
                entry["reacted"] = True
        return list(grouped.values())

    def get_reply_count(self, obj):
        if obj.parent_id:
            return 0
        return obj.replies.filter(is_deleted=False).count()


class ConversationMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ConversationMember
        fields = ("user", "role", "joined_at")


class ConversationSerializer(serializers.ModelSerializer):
    members = ConversationMemberSerializer(many=True, read_only=True)
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "type",
            "name",
            "description",
            "is_public",
            "is_locked",
            "canvas_body",
            "members",
            "other_user",
            "last_message",
            "updated_at",
        )

    def get_other_user(self, obj):
        request = self.context.get("request")
        if request is None or obj.type != Conversation.DIRECT:
            return None
        other_member = (
            obj.members.select_related("user", "user__profile").exclude(user=request.user).first()
        )
        if other_member is None:
            return None
        return UserSerializer(other_member.user).data

    def get_last_message(self, obj):
        message = (
            obj.messages.filter(parent__isnull=True)
            .select_related("sender", "sender__profile")
            .last()
        )
        if message is None:
            return None
        return MessageSerializer(message, context=self.context).data


class DirectConversationCreateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()

    def validate_user_id(self, value):
        request = self.context["request"]
        if value == request.user.id:
            raise serializers.ValidationError("You cannot start a chat with yourself.")
        if not User.objects.filter(id=value).exists():
            raise serializers.ValidationError("User not found.")
        return value


class GroupConversationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    member_ids = serializers.ListField(child=serializers.IntegerField(), min_length=2)

    def validate_name(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Group name is required.")
        return cleaned

    def validate_member_ids(self, value):
        request = self.context["request"]
        unique_ids = list(dict.fromkeys(value))
        if len(unique_ids) < 2:
            raise serializers.ValidationError("Select at least 2 other members for a group chat.")
        if request.user.id in unique_ids:
            raise serializers.ValidationError("Do not include yourself in member_ids.")
        if User.objects.filter(id__in=unique_ids).count() != len(unique_ids):
            raise serializers.ValidationError("One or more users were not found.")
        return unique_ids


class ChannelCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_public = serializers.BooleanField(default=False)
    member_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)

    def validate_name(self, value):
        cleaned = value.strip().lstrip("#")
        if not cleaned:
            raise serializers.ValidationError("Channel name is required.")
        return cleaned

    def validate_member_ids(self, value):
        request = self.context["request"]
        unique_ids = [uid for uid in dict.fromkeys(value) if uid != request.user.id]
        if User.objects.filter(id__in=unique_ids).count() != len(unique_ids):
            raise serializers.ValidationError("One or more users were not found.")
        return unique_ids


class ReactionToggleSerializer(serializers.Serializer):
    emoji = serializers.CharField(max_length=32)


class ChannelResourceSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = ChannelResource
        fields = ("id", "title", "url", "body", "created_by", "created_at")
        read_only_fields = ("id", "created_by", "created_at")


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "notification_type",
            "title",
            "body",
            "conversation",
            "message",
            "is_read",
            "created_at",
        )
        read_only_fields = fields


class NotificationPreferencesSerializer(serializers.Serializer):
    dnd_enabled = serializers.BooleanField(required=False)
    work_hours_start = serializers.TimeField(required=False, allow_null=True)
    work_hours_end = serializers.TimeField(required=False, allow_null=True)


class ConversationSettingsSerializer(serializers.Serializer):
    notification_level = serializers.ChoiceField(
        choices=[ConversationMember.ALL, ConversationMember.MENTIONS, ConversationMember.MUTE],
        required=False,
    )
    is_locked = serializers.BooleanField(required=False)
    canvas_body = serializers.CharField(required=False, allow_blank=True)


class ScheduledMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledMessage
        fields = ("id", "body", "scheduled_at", "is_urgent", "parent", "delivered", "created_at")
        read_only_fields = ("id", "delivered", "created_at")


class CardMessageCreateSerializer(serializers.Serializer):
    card_type = serializers.ChoiceField(choices=[Message.POLL, Message.APPROVAL])
    card_data = serializers.DictField()

    def validate(self, attrs):
        card_type = attrs["card_type"]
        data = attrs["card_data"]
        if card_type == Message.POLL:
            if not data.get("question") or not data.get("options") or len(data["options"]) < 2:
                raise serializers.ValidationError("Poll requires question and at least 2 options.")
        if card_type == Message.APPROVAL:
            if not data.get("title"):
                raise serializers.ValidationError("Approval card requires a title.")
            data.setdefault("required", 1)
        return attrs


class CatchUpSerializer(serializers.Serializer):
    since = serializers.CharField()
    message_count = serializers.IntegerField()
    highlights = MessageSerializer(many=True)
    summary = serializers.CharField()


class AuditLogSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = ("id", "actor", "action", "target_type", "target_id", "metadata", "created_at")


class WebhookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Webhook
        fields = (
            "id",
            "name",
            "url",
            "secret",
            "direction",
            "events",
            "conversation",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "secret", "created_at")
