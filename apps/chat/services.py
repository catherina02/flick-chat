from django.contrib.auth import get_user_model

from apps.chat.models import ConversationMember, Message, Notification
from apps.chat.notification_policy import should_notify_user
from apps.chat.push import send_push_to_user
from apps.chat.realtime import broadcast_notification, broadcast_to_conversation, broadcast_to_user
from apps.chat.serializers import MessageSerializer, NotificationSerializer
from apps.chat.webhooks import dispatch_outgoing_webhooks

User = get_user_model()


def message_payload(message: Message, event_type: str, request=None) -> dict:
    data = MessageSerializer(message, context={"request": request}).data
    return {
        "type": event_type,
        **data,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender": message.sender.username,
    }


def message_event_payload(message: Message, request=None) -> dict:
    return message_payload(message, "message.new", request=request)


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
        member = ConversationMember.objects.filter(conversation=conversation, user_id=user_id).first()
        user = User.objects.select_related("profile").filter(id=user_id).first()
        if user is None:
            continue
        if not should_notify_user(
            user=user,
            conversation=conversation,
            message=message,
            membership=member,
        ):
            continue

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
    payload = message_event_payload(message, request=request)
    broadcast_to_conversation(message.conversation_id, payload)
    notify_new_message(message, request=request)
    dispatch_outgoing_webhooks(message)


def broadcast_message_updated(message: Message, request=None) -> None:
    payload = message_payload(message, "message.updated", request=request)
    broadcast_to_conversation(message.conversation_id, payload)


def broadcast_message_deleted(message: Message, request=None) -> None:
    payload = message_payload(message, "message.deleted", request=request)
    broadcast_to_conversation(message.conversation_id, payload)


def broadcast_reaction_updated(message: Message, request=None) -> None:
    payload = message_payload(message, "message.updated", request=request)
    broadcast_to_conversation(message.conversation_id, payload)


def broadcast_conversation_deleted(user_id: int, conversation_id: int) -> None:
    broadcast_to_user(
        user_id,
        {"type": "conversation.deleted", "conversation_id": conversation_id},
    )


def _conversation_title(conversation, sender) -> str:
    if conversation.type == conversation.GROUP:
        return conversation.name or "Group Chat"
    return sender.username


def _attachment_preview(message: Message) -> str:
    if message.message_type == Message.IMAGE:
        return "Sent an image"
    if message.message_type == Message.AUDIO:
        return "Sent a voice note"
    if message.message_type == Message.FILE:
        return f"Sent {message.file_name or 'a file'}"
    if message.message_type == Message.CARD:
        return f"Sent a {message.card_type or 'card'}"
    return "Sent a message"

