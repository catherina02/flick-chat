import mimetypes
import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.serializers import UserSerializer

from .authentication import QueryParamJWTAuthentication
from .message_serializers import MessageEditSerializer
from .models import ChannelResource, Conversation, ConversationMember, Message, MessageReaction, MessageRead, Notification
from .permissions import can_moderate_message, can_post_message, require_admin
from .realtime import broadcast_conversation_created, broadcast_to_conversation
from .serializers import (
    ChannelCreateSerializer,
    ChannelResourceSerializer,
    ConversationSerializer,
    DirectConversationCreateSerializer,
    GroupConversationCreateSerializer,
    MessageSerializer,
    NotificationSerializer,
    ReactionToggleSerializer,
)
from .services import (
    broadcast_conversation_deleted,
    broadcast_message,
    broadcast_message_deleted,
    broadcast_message_updated,
    broadcast_reaction_updated,
    message_event_payload,
    message_payload,
    notify_group_created,
)

User = get_user_model()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
EDIT_WINDOW_MINUTES = 15
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    "audio/webm",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
}
ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".txt",
    ".zip",
    ".doc",
    ".docx",
    ".webm",
    ".ogg",
    ".mp3",
    ".m4a",
    ".wav",
}


def _normalize_content_type(uploaded_file) -> str:
    content_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0]
    if content_type:
        return content_type
    ext = os.path.splitext(uploaded_file.name)[1].lower()
    guessed = mimetypes.types_map.get(ext)
    return guessed or "application/octet-stream"


def _is_allowed_upload(uploaded_file) -> bool:
    content_type = _normalize_content_type(uploaded_file)
    if content_type in ALLOWED_CONTENT_TYPES:
        return True
    ext = os.path.splitext(uploaded_file.name)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _detect_message_type(uploaded_file) -> str:
    content_type = _normalize_content_type(uploaded_file)
    if content_type.startswith("image/"):
        return Message.IMAGE
    if content_type.startswith("audio/"):
        return Message.AUDIO
    return Message.FILE


def _is_conversation_member(user, conversation_id: int) -> bool:
    return ConversationMember.objects.filter(
        conversation_id=conversation_id,
        user=user,
    ).exists()


def _edit_window_expired(message: Message) -> bool:
    return timezone.now() - message.created_at > timedelta(minutes=EDIT_WINDOW_MINUTES)


class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return User.objects.exclude(id=self.request.user.id).select_related("profile")


class ConversationListView(generics.ListAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Conversation.objects.filter(members__user=self.request.user)
            .distinct()
            .prefetch_related("members__user__profile")
            .prefetch_related("messages__sender__profile")
            .order_by("-updated_at")
        )


class DirectConversationCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DirectConversationCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        other_user_id = serializer.validated_data["user_id"]

        existing = (
            Conversation.objects.filter(type=Conversation.DIRECT, members__user=request.user)
            .annotate(member_count=Count("members", distinct=True))
            .filter(member_count=2, members__user_id=other_user_id)
            .distinct()
            .first()
        )
        if existing:
            conversation = existing
            created = False
        else:
            conversation = Conversation.objects.create(type=Conversation.DIRECT)
            ConversationMember.objects.bulk_create(
                [
                    ConversationMember(conversation=conversation, user=request.user),
                    ConversationMember(conversation=conversation, user_id=other_user_id),
                ]
            )
            created = True

        conversation = (
            Conversation.objects.filter(id=conversation.id)
            .prefetch_related("members__user__profile")
            .first()
        )
        data = ConversationSerializer(conversation, context={"request": request}).data

        if created:
            broadcast_conversation_created([request.user.id, other_user_id], data)

        return Response(data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)


class GroupConversationCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = GroupConversationCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        member_ids = serializer.validated_data["member_ids"]
        conversation = Conversation.objects.create(
            type=Conversation.GROUP,
            name=serializer.validated_data["name"],
        )

        members = [
            ConversationMember(
                conversation=conversation,
                user=request.user,
                role=ConversationMember.ADMIN,
            ),
            *[
                ConversationMember(conversation=conversation, user_id=user_id)
                for user_id in member_ids
            ],
        ]
        ConversationMember.objects.bulk_create(members)

        conversation = (
            Conversation.objects.filter(id=conversation.id)
            .prefetch_related("members__user__profile")
            .first()
        )
        data = ConversationSerializer(conversation, context={"request": request}).data

        all_member_ids = [request.user.id, *member_ids]
        broadcast_conversation_created(all_member_ids, data)
        notify_group_created(conversation, member_ids, request=request)

        return Response(data, status=status.HTTP_201_CREATED)


class MessageListView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        conversation_id = self.kwargs["conversation_id"]
        if not ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=self.request.user,
        ).exists():
            return Message.objects.none()

        thread_id = self.request.query_params.get("thread")
        qs = Message.objects.filter(conversation_id=conversation_id)
        if thread_id:
            qs = qs.filter(parent_id=thread_id)
        else:
            qs = qs.filter(parent__isnull=True)

        return (
            qs.select_related("sender", "sender__profile", "parent")
            .prefetch_related("reads", "reactions", "reactions__user")
            .order_by("created_at")
        )


class MessageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, conversation_id):
        membership = ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
        ).first()
        if membership is None:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if not can_post_message(conversation, membership):
            return Response({"detail": "This channel is read-only."}, status=status.HTTP_403_FORBIDDEN)

        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_file.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "File too large (max 10 MB)."}, status=status.HTTP_400_BAD_REQUEST)

        if not _is_allowed_upload(uploaded_file):
            return Response({"detail": "File type not allowed."}, status=status.HTTP_400_BAD_REQUEST)

        caption = (request.data.get("body") or "").strip()
        transcript = (request.data.get("transcript") or "").strip()
        message_type = _detect_message_type(uploaded_file)
        content_type = _normalize_content_type(uploaded_file)
        file_bytes = uploaded_file.read()

        message = Message.objects.create(
            conversation_id=conversation_id,
            sender=request.user,
            message_type=message_type,
            body=caption,
            transcript=transcript,
            attachment_data=file_bytes,
            content_type=content_type,
            file_name=os.path.basename(uploaded_file.name),
            file_size=len(file_bytes),
        )
        message.conversation.save(update_fields=["updated_at"])

        broadcast_message(message, request=request)
        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MessageAttachmentView(APIView):
    authentication_classes = [JWTAuthentication, QueryParamJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        is_member = ConversationMember.objects.filter(
            conversation_id=message.conversation_id,
            user=request.user,
        ).exists()
        if not is_member:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if message.attachment_data:
            content_type = message.content_type or "application/octet-stream"
            response = HttpResponse(bytes(message.attachment_data), content_type=content_type)
            disposition = "inline" if message.message_type == Message.IMAGE else "attachment"
            response["Content-Disposition"] = f'{disposition}; filename="{message.file_name or "file"}"'
            response["Content-Length"] = str(message.file_size or len(message.attachment_data))
            return response

        if message.attachment:
            return FileResponse(
                message.attachment.open("rb"),
                content_type=message.content_type or "application/octet-stream",
                filename=message.file_name or "file",
            )

        return Response({"detail": "No attachment."}, status=status.HTTP_404_NOT_FOUND)


class MessageEditView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        if not _is_conversation_member(request.user, message.conversation_id):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if message.sender_id != request.user.id:
            return Response({"detail": "You can only edit your own messages."}, status=status.HTTP_403_FORBIDDEN)
        if message.is_deleted:
            return Response({"detail": "Deleted messages cannot be edited."}, status=status.HTTP_400_BAD_REQUEST)
        if _edit_window_expired(message):
            return Response(
                {"detail": f"Messages can only be edited within {EDIT_WINDOW_MINUTES} minutes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = MessageEditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message.body = serializer.validated_data["body"]
        message.edited_at = timezone.now()
        message.save(update_fields=["body", "edited_at"])

        broadcast_message_updated(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data)


class MessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        membership = ConversationMember.objects.filter(
            conversation_id=message.conversation_id,
            user=request.user,
        ).first()
        if membership is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_moderate_message(request.user, membership, message):
            return Response({"detail": "You can only delete your own messages."}, status=status.HTTP_403_FORBIDDEN)
        if message.is_deleted:
            return Response(MessageSerializer(message, context={"request": request}).data)

        message.is_deleted = True
        message.body = ""
        message.attachment_data = None
        message.attachment = None
        message.file_name = ""
        message.file_size = 0
        message.content_type = ""
        message.save()

        broadcast_message_deleted(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data)


class ConversationMediaListView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        conversation_id = self.kwargs["conversation_id"]
        if not _is_conversation_member(self.request.user, conversation_id):
            return Message.objects.none()
        return (
            Message.objects.filter(
                conversation_id=conversation_id,
                is_deleted=False,
                message_type__in=[Message.IMAGE, Message.FILE, Message.AUDIO],
            )
            .select_related("sender", "sender__profile")
            .order_by("-created_at")
        )


class ConversationDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        membership = ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
        ).first()
        if membership is None:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        conversation = (
            Conversation.objects.filter(id=conversation_id)
            .prefetch_related("members__user__profile")
            .first()
        )
        return Response(ConversationSerializer(conversation, context={"request": request}).data)

    def delete(self, request, conversation_id):
        membership = ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
        ).first()
        if membership is None:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        membership.delete()
        if not ConversationMember.objects.filter(conversation_id=conversation_id).exists():
            Conversation.objects.filter(id=conversation_id).delete()

        broadcast_conversation_deleted(request.user.id, conversation_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MarkConversationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id):
        if not ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
        ).exists():
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        messages = Message.objects.filter(conversation_id=conversation_id).exclude(
            sender=request.user
        )
        for message in messages:
            MessageRead.objects.get_or_create(message=message, user=request.user)

        Notification.objects.filter(
            user=request.user,
            conversation_id=conversation_id,
            is_read=False,
        ).update(is_read=True)

        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")


class NotificationUnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"count": count})


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, notification_id):
        updated = Notification.objects.filter(
            id=notification_id,
            user=request.user,
        ).update(is_read=True)
        if not updated:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationMarkAllReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChannelCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChannelCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        member_ids = serializer.validated_data.get("member_ids", [])
        conversation = Conversation.objects.create(
            type=Conversation.CHANNEL,
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            is_public=serializer.validated_data.get("is_public", False),
        )
        members = [
            ConversationMember(
                conversation=conversation,
                user=request.user,
                role=ConversationMember.ADMIN,
            ),
            *[ConversationMember(conversation=conversation, user_id=uid) for uid in member_ids],
        ]
        ConversationMember.objects.bulk_create(members)
        conversation = Conversation.objects.filter(id=conversation.id).prefetch_related(
            "members__user__profile"
        ).first()
        data = ConversationSerializer(conversation, context={"request": request}).data
        broadcast_conversation_created([request.user.id, *member_ids], data)
        return Response(data, status=status.HTTP_201_CREATED)


class PublicChannelListView(generics.ListAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        joined_ids = ConversationMember.objects.filter(user=self.request.user).values_list(
            "conversation_id", flat=True
        )
        return (
            Conversation.objects.filter(type=Conversation.CHANNEL, is_public=True)
            .exclude(id__in=joined_ids)
            .prefetch_related("members__user__profile")
            .order_by("name")
        )


class ChannelJoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id, type=Conversation.CHANNEL)
        if not conversation.is_public:
            return Response({"detail": "Private channel."}, status=status.HTTP_403_FORBIDDEN)
        ConversationMember.objects.get_or_create(
            conversation=conversation,
            user=request.user,
            defaults={"role": ConversationMember.MEMBER},
        )
        data = ConversationSerializer(conversation, context={"request": request}).data
        return Response(data)


class MessageReactionToggleView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        if not _is_conversation_member(request.user, message.conversation_id):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ReactionToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        emoji = serializer.validated_data["emoji"]
        existing = MessageReaction.objects.filter(message=message, user=request.user, emoji=emoji).first()
        if existing:
            existing.delete()
        else:
            MessageReaction.objects.create(message=message, user=request.user, emoji=emoji)
        message = Message.objects.filter(id=message.id).prefetch_related("reactions", "reactions__user").first()
        broadcast_reaction_updated(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data)


class MessagePinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        membership = ConversationMember.objects.filter(
            conversation_id=message.conversation_id,
            user=request.user,
        ).first()
        if membership is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        message.is_pinned = not message.is_pinned
        message.save(update_fields=["is_pinned"])
        payload = message_payload(message, "message.updated", request=request)
        broadcast_to_conversation(message.conversation_id, payload)
        return Response(MessageSerializer(message, context={"request": request}).data)


class MessageSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response([])
        conversation_ids = ConversationMember.objects.filter(user=request.user).values_list(
            "conversation_id", flat=True
        )
        messages = (
            Message.objects.filter(
                conversation_id__in=conversation_ids,
                is_deleted=False,
                body__icontains=query,
            )
            .select_related("sender", "conversation")
            .order_by("-created_at")[:40]
        )
        results = []
        for message in messages:
            data = MessageSerializer(message, context={"request": request}).data
            data["conversation_name"] = message.conversation.name or "Chat"
            results.append(data)
        return Response(results)


class ChannelResourceListCreateView(generics.ListCreateAPIView):
    serializer_class = ChannelResourceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        conversation_id = self.kwargs["conversation_id"]
        if not _is_conversation_member(self.request.user, conversation_id):
            return ChannelResource.objects.none()
        return ChannelResource.objects.filter(conversation_id=conversation_id).select_related(
            "created_by", "created_by__profile"
        )

    def perform_create(self, serializer):
        conversation_id = self.kwargs["conversation_id"]
        if not _is_conversation_member(self.request.user, conversation_id):
            raise PermissionDenied()
        serializer.save(conversation_id=conversation_id, created_by=self.request.user)

