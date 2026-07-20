from django.contrib.auth import get_user_model

from apps.chat.models import ConversationMember, Message, Notification
from apps.chat.push import send_push_to_user
from apps.chat.realtime import broadcast_notification, broadcast_to_conversation
from apps.chat.serializers import MessageSerializer, NotificationSerializer

User = get_user_model()


def message_payload(message: Message, request=None) -> dict:
    data = MessageSerializer(message, context={"request": request}).data
    return {
        "type": "message.new",
        **data,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender": message.sender.username,
    }


def notify_new_message(message: Message, request=None) -> None:
    conversation = message.conversation
    member_ids = list(
        ConversationMember.objects.filter(conversation=conversation)
        .exclude(user_id=message.sender_id)
        .values_list("user_id", flat=True)
    )

    preview = message.body.strip() or _attachment_preview(message)
    title = _conversation_title(conversation, message.sender)

    for user_id in member_ids:
        notification = Notification.objects.create(
            user_id=user_id,
            notification_type=Notification.MESSAGE,
            title=title,
            body=f"{message.sender.username}: {preview}",
            conversation=conversation,
            message=message,
        )
        notification_data = NotificationSerializer(notification).data
        broadcast_notification(user_id, notification_data)
        send_push_to_user(
            user_id,
            title=title,
            body=f"{message.sender.username}: {preview}",
            data={
                "conversation_id": str(conversation.id),
                "notification_id": str(notification.id),
            },
        )


def notify_group_created(conversation, added_user_ids: list[int], request=None) -> None:
    creator = conversation.members.select_related("user").first()
    creator_name = creator.user.username if creator else "Someone"
    title = conversation.name or "New group chat"
    body = f"{creator_name} added you to {title}"

    for user_id in added_user_ids:
        notification = Notification.objects.create(
            user_id=user_id,
            notification_type=Notification.GROUP,
            title=title,
            body=body,
            conversation=conversation,
        )
        notification_data = NotificationSerializer(notification).data
        broadcast_notification(user_id, notification_data)
        send_push_to_user(
            user_id,
            title=title,
            body=body,
            data={"conversation_id": str(conversation.id)},
        )


def broadcast_message(message: Message, request=None) -> None:
    payload = message_payload(message, request=request)
    broadcast_to_conversation(message.conversation_id, payload)
    notify_new_message(message, request=request)


def _conversation_title(conversation, sender) -> str:
    if conversation.type == conversation.GROUP:
        return conversation.name or "Group Chat"
    return sender.username


def _attachment_preview(message: Message) -> str:
    if message.message_type == Message.IMAGE:
        return "Sent an image"
    if message.message_type == Message.FILE:
        return f"Sent {message.file_name or 'a file'}"
    return "Sent a message"
