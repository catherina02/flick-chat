from django.contrib.auth import get_user_model

from rest_framework import serializers



from apps.accounts.serializers import UserSerializer



from .models import Conversation, ConversationMember, Message, MessageRead, Notification



User = get_user_model()





class MessageSerializer(serializers.ModelSerializer):

    sender = UserSerializer(read_only=True)

    read_by = serializers.SerializerMethodField()

    attachment_url = serializers.SerializerMethodField()



    class Meta:

        model = Message

        fields = (

            "id",

            "conversation",

            "sender",

            "message_type",

            "body",

            "attachment_url",

            "file_name",

            "file_size",

            "is_deleted",

            "edited_at",

            "created_at",

            "read_by",

        )

        read_only_fields = fields



    def get_read_by(self, obj):

        return list(

            obj.reads.exclude(user_id=obj.sender_id).values_list("user_id", flat=True)

        )



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





class ConversationMemberSerializer(serializers.ModelSerializer):

    user = UserSerializer(read_only=True)



    class Meta:

        model = ConversationMember

        fields = ("user", "joined_at")





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

            "members",

            "other_user",

            "last_message",

            "updated_at",

        )



    def get_other_user(self, obj):

        request = self.context.get("request")

        if request is None:

            return None



        other_member = (

            obj.members.select_related("user", "user__profile")

            .exclude(user=request.user)

            .first()

        )

        if other_member is None:

            return None

        return UserSerializer(other_member.user).data



    def get_last_message(self, obj):

        message = obj.messages.select_related("sender", "sender__profile").last()

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

    member_ids = serializers.ListField(

        child=serializers.IntegerField(),

        min_length=2,

    )



    def validate_name(self, value):

        cleaned = value.strip()

        if not cleaned:

            raise serializers.ValidationError("Group name is required.")

        return cleaned



    def validate_member_ids(self, value):

        request = self.context["request"]

        unique_ids = list(dict.fromkeys(value))



        if len(unique_ids) < 2:

            raise serializers.ValidationError(

                "Select at least 2 other members for a group chat."

            )



        if request.user.id in unique_ids:

            raise serializers.ValidationError("Do not include yourself in member_ids.")



        found_count = User.objects.filter(id__in=unique_ids).count()

        if found_count != len(unique_ids):

            raise serializers.ValidationError("One or more users were not found.")



        return unique_ids





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


