import json
import secrets
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.serializers import UserSerializer

from .audit import log_audit
from .models import (
    AuditLog,
    Conversation,
    ConversationMember,
    Message,
    ScheduledMessage,
    Webhook,
)
from .permissions import can_moderate_message, can_post_message, require_admin, require_member
from .realtime import broadcast_to_conversation
from .serializers import (
    AuditLogSerializer,
    CardMessageCreateSerializer,
    CatchUpSerializer,
    ConversationSettingsSerializer,
    MessageSerializer,
    NotificationPreferencesSerializer,
    ScheduledMessageSerializer,
    WebhookSerializer,
)
from .services import broadcast_message, broadcast_message_deleted, broadcast_message_updated, message_event_payload
from .webhooks import dispatch_outgoing_webhooks, post_incoming_message

User = get_user_model()


class NotificationPreferencesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = request.user.profile
        return Response(
            NotificationPreferencesSerializer(
                {
                    "dnd_enabled": profile.dnd_enabled,
                    "work_hours_start": profile.work_hours_start,
                    "work_hours_end": profile.work_hours_end,
                }
            ).data
        )

    def patch(self, request):
        serializer = NotificationPreferencesSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = request.user.profile
        for field in ("dnd_enabled", "work_hours_start", "work_hours_end"):
            if field in serializer.validated_data:
                setattr(profile, field, serializer.validated_data[field])
        profile.save()
        return Response(
            NotificationPreferencesSerializer(
                {
                    "dnd_enabled": profile.dnd_enabled,
                    "work_hours_start": profile.work_hours_start,
                    "work_hours_end": profile.work_hours_end,
                }
            ).data
        )


class ConversationSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        membership = require_member(request.user, conversation_id)
        conversation = get_object_or_404(Conversation, id=conversation_id)
        return Response(
            {
                "notification_level": membership.notification_level,
                "is_locked": conversation.is_locked,
                "canvas_body": conversation.canvas_body,
                "role": membership.role,
            }
        )

    def patch(self, request, conversation_id):
        membership = require_member(request.user, conversation_id)
        conversation = get_object_or_404(Conversation, id=conversation_id)
        serializer = ConversationSettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if "notification_level" in serializer.validated_data:
            membership.notification_level = serializer.validated_data["notification_level"]
            membership.save(update_fields=["notification_level"])

        admin_fields = {"is_locked", "canvas_body"}
        if admin_fields.intersection(serializer.validated_data):
            require_admin(request.user, conversation_id)
            if "is_locked" in serializer.validated_data:
                conversation.is_locked = serializer.validated_data["is_locked"]
            if "canvas_body" in serializer.validated_data:
                conversation.canvas_body = serializer.validated_data["canvas_body"]
            conversation.save()

        return Response(
            {
                "notification_level": membership.notification_level,
                "is_locked": conversation.is_locked,
                "canvas_body": conversation.canvas_body,
                "role": membership.role,
            }
        )


class ScheduledMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ScheduledMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        conversation_id = self.kwargs["conversation_id"]
        require_member(self.request.user, conversation_id)
        return ScheduledMessage.objects.filter(
            conversation_id=conversation_id,
            sender=self.request.user,
            delivered=False,
        ).order_by("scheduled_at")

    def perform_create(self, serializer):
        conversation_id = self.kwargs["conversation_id"]
        membership = require_member(self.request.user, conversation_id)
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if not can_post_message(conversation, membership):
            raise PermissionDenied("You cannot post in this conversation.")
        scheduled_at = serializer.validated_data["scheduled_at"]
        if scheduled_at <= timezone.now():
            raise ValidationError({"scheduled_at": "Must be in the future."})
        serializer.save(conversation_id=conversation_id, sender=self.request.user)


class ScheduledMessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, scheduled_id):
        scheduled = get_object_or_404(
            ScheduledMessage,
            id=scheduled_id,
            sender=request.user,
            delivered=False,
        )
        scheduled.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CardMessageCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id):
        membership = require_member(request.user, conversation_id)
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if not can_post_message(conversation, membership):
            raise PermissionDenied("You cannot post in this conversation.")

        serializer = CardMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        card_type = serializer.validated_data["card_type"]
        card_data = serializer.validated_data["card_data"]

        if card_type == Message.POLL:
            card_data.setdefault("votes", {opt: [] for opt in card_data.get("options", [])})
        if card_type == Message.APPROVAL:
            card_data.setdefault("approvals", [])
            card_data.setdefault("rejections", [])
            card_data.setdefault("status", "pending")

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            message_type=Message.CARD,
            card_type=card_type,
            card_data=card_data,
            body=card_data.get("question") or card_data.get("title") or "Interactive card",
        )
        conversation.save(update_fields=["updated_at"])
        broadcast_message(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data, status=status.HTTP_201_CREATED)


class CardActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, message_id):
        message = get_object_or_404(Message, id=message_id, message_type=Message.CARD)
        require_member(request.user, message.conversation_id)
        action = request.data.get("action")
        card_data = dict(message.card_data or {})

        if message.card_type == Message.POLL:
            option = request.data.get("option")
            if not option or option not in card_data.get("options", []):
                return Response({"detail": "Invalid option."}, status=status.HTTP_400_BAD_REQUEST)
            votes = card_data.setdefault("votes", {})
            for opt, voters in votes.items():
                if request.user.id in voters:
                    voters.remove(request.user.id)
            votes.setdefault(option, [])
            if request.user.id not in votes[option]:
                votes[option].append(request.user.id)

        elif message.card_type == Message.APPROVAL:
            if action not in ("approve", "reject"):
                return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
            approvals = card_data.setdefault("approvals", [])
            rejections = card_data.setdefault("rejections", [])
            uid = request.user.id
            if uid in approvals:
                approvals.remove(uid)
            if uid in rejections:
                rejections.remove(uid)
            if action == "approve":
                approvals.append(uid)
            else:
                rejections.append(uid)
            card_data["status"] = "approved" if len(approvals) >= card_data.get("required", 1) else (
                "rejected" if rejections else "pending"
            )
        else:
            return Response({"detail": "Unsupported card type."}, status=status.HTTP_400_BAD_REQUEST)

        message.card_data = card_data
        message.save(update_fields=["card_data"])
        broadcast_message_updated(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data)


class CatchUpSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        require_member(request.user, conversation_id)
        since = request.query_params.get("since")
        if since:
            try:
                since_dt = timezone.datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                since_dt = timezone.now() - timedelta(hours=24)
        else:
            since_dt = timezone.now() - timedelta(hours=24)

        messages = (
            Message.objects.filter(
                conversation_id=conversation_id,
                created_at__gte=since_dt,
                is_deleted=False,
                parent__isnull=True,
            )
            .select_related("sender")
            .order_by("-created_at")
        )

        highlights = []
        for message in messages:
            if message.is_pinned or message.is_urgent or message.replies.filter(is_deleted=False).count() > 1:
                highlights.append(message)
            if len(highlights) >= 8:
                break

        if not highlights:
            highlights = list(messages[:5])

        summary_parts = []
        for message in reversed(highlights):
            prefix = message.sender.username
            text = (message.body or "")[:120]
            if message.is_urgent:
                prefix = f"🚨 {prefix}"
            if message.is_pinned:
                prefix = f"📌 {prefix}"
            summary_parts.append(f"{prefix}: {text}")

        data = {
            "since": since_dt.isoformat(),
            "message_count": messages.count(),
            "highlights": MessageSerializer(highlights, many=True, context={"request": request}).data,
            "summary": "\n".join(summary_parts) if summary_parts else "No notable activity in this period.",
        }
        return Response(data)


class AdminMessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, message_id):
        message = get_object_or_404(Message, id=message_id)
        membership = require_member(request.user, message.conversation_id)
        if not can_moderate_message(request.user, membership, message):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        message.is_deleted = True
        message.body = ""
        message.attachment_data = None
        message.save()
        log_audit(
            actor=request.user,
            action="message.delete",
            target_type="message",
            target_id=message.id,
            metadata={"moderated": message.sender_id != request.user.id},
        )
        broadcast_message_deleted(message, request=request)
        return Response(MessageSerializer(message, context={"request": request}).data)


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").order_by("-created_at")[:200]


class WebhookListCreateView(generics.ListCreateAPIView):
    serializer_class = WebhookSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Webhook.objects.filter(created_by=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        secret = secrets.token_urlsafe(24)
        webhook = serializer.save(created_by=self.request.user, secret=secret)
        log_audit(
            actor=self.request.user,
            action="webhook.create",
            target_type="webhook",
            target_id=webhook.id,
        )


class WebhookDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, webhook_id):
        webhook = get_object_or_404(Webhook, id=webhook_id, created_by=request.user)
        webhook.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookIncomingView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, secret):
        webhook = get_object_or_404(Webhook, secret=secret, direction=Webhook.INCOMING, is_active=True)
        text = (request.data.get("text") or request.data.get("body") or "").strip()
        if not text:
            return Response({"detail": "text required."}, status=status.HTTP_400_BAD_REQUEST)
        if webhook.conversation_id is None:
            return Response({"detail": "Webhook not linked to a channel."}, status=status.HTTP_400_BAD_REQUEST)
        message = post_incoming_message(webhook.conversation_id, webhook.created_by_id, text, request=request)
        return Response({"message_id": message.id}, status=status.HTTP_201_CREATED)


class GoogleSSOView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        id_token = request.data.get("id_token")
        if not id_token:
            return Response({"detail": "id_token required."}, status=status.HTTP_400_BAD_REQUEST)

        client_id = getattr(settings, "GOOGLE_CLIENT_ID", "") or ""
        try:
            url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            with urllib.request.urlopen(url, timeout=10) as response:
                payload = json.loads(response.read().decode())
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
            return Response({"detail": "Invalid Google token."}, status=status.HTTP_400_BAD_REQUEST)

        if client_id and payload.get("aud") != client_id:
            return Response({"detail": "Token audience mismatch."}, status=status.HTTP_400_BAD_REQUEST)

        email = (payload.get("email") or "").lower()
        if not email or payload.get("email_verified") not in (True, "true"):
            return Response({"detail": "Email not verified."}, status=status.HTTP_400_BAD_REQUEST)

        username = email.split("@")[0][:30]
        user, created = User.objects.get_or_create(
            email=email,
            defaults={"username": username},
        )
        if created:
            user.set_unusable_password()
            user.save()
            log_audit(actor=user, action="user.sso_create", target_type="user", target_id=user.id)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class AzureSSOView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get("access_token")
        if not access_token:
            return Response({"detail": "access_token required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            req = urllib.request.Request(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode())
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
            return Response({"detail": "Invalid Azure token."}, status=status.HTTP_400_BAD_REQUEST)

        email = (payload.get("mail") or payload.get("userPrincipalName") or "").lower()
        if not email:
            return Response({"detail": "Email not found in profile."}, status=status.HTTP_400_BAD_REQUEST)

        username = email.split("@")[0][:30]
        user, created = User.objects.get_or_create(
            email=email,
            defaults={"username": username},
        )
        if created:
            user.set_unusable_password()
            user.save()

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class OffboardUserView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        user.is_active = False
        user.save(update_fields=["is_active"])
        ConversationMember.objects.filter(user=user).delete()
        from apps.accounts.models import DeviceToken

        DeviceToken.objects.filter(user=user).delete()
        log_audit(
            actor=request.user,
            action="user.offboard",
            target_type="user",
            target_id=user.id,
        )
        return Response({"detail": "User offboarded."})


class MemberRoleUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, conversation_id, user_id):
        require_admin(request.user, conversation_id)
        membership = get_object_or_404(
            ConversationMember,
            conversation_id=conversation_id,
            user_id=user_id,
        )
        role = request.data.get("role")
        if role not in dict(ConversationMember.ROLE_CHOICES):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        membership.role = role
        membership.save(update_fields=["role"])
        log_audit(
            actor=request.user,
            action="member.role_update",
            target_type="conversation_member",
            target_id=membership.id,
            metadata={"role": role},
        )
        return Response({"user_id": user_id, "role": role})
