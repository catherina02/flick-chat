import mimetypes
import os

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.serializers import UserSerializer

from .authentication import QueryParamJWTAuthentication
from .models import Conversation, ConversationMember, Message, MessageRead, Notification
from .realtime import broadcast_conversation_created
from .serializers import (
    ConversationSerializer,
    DirectConversationCreateSerializer,
    GroupConversationCreateSerializer,
    MessageSerializer,
    NotificationSerializer,
)
from .services import broadcast_message, notify_group_created

User = get_user_model()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
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
    return Message.FILE


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
            ConversationMember(conversation=conversation, user=request.user),
            *[ConversationMember(conversation=conversation, user_id=user_id) for user_id in member_ids],
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
        return (
            Message.objects.filter(conversation_id=conversation_id)
            .select_related("sender", "sender__profile")
            .prefetch_related("reads")
            .order_by("created_at")
        )


class MessageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, conversation_id):
        if not ConversationMember.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
        ).exists():
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_file.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "File too large (max 10 MB)."}, status=status.HTTP_400_BAD_REQUEST)

        if not _is_allowed_upload(uploaded_file):
            return Response({"detail": "File type not allowed."}, status=status.HTTP_400_BAD_REQUEST)

        caption = (request.data.get("body") or "").strip()
        message_type = _detect_message_type(uploaded_file)
        content_type = _normalize_content_type(uploaded_file)
        file_bytes = uploaded_file.read()

        message = Message.objects.create(
            conversation_id=conversation_id,
            sender=request.user,
            message_type=message_type,
            body=caption,
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

