from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def _send(group_name: str, event_type: str, payload: dict) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        group_name,
        {"type": event_type, "payload": payload},
    )


def broadcast_to_user(user_id: int, payload: dict) -> None:
    _send(f"user_{user_id}", "user.event", payload)


def broadcast_to_conversation(conversation_id: int, payload: dict) -> None:
    _send(f"conv_{conversation_id}", "chat.message", payload)


def broadcast_conversation_created(user_ids: list[int], conversation_data: dict) -> None:
    payload = {
        "type": "conversation.created",
        "conversation": conversation_data,
    }
    for user_id in user_ids:
        broadcast_to_user(user_id, payload)


def broadcast_notification(user_id: int, notification_data: dict) -> None:
    payload = {
        "type": "notification.new",
        "notification": notification_data,
    }
    broadcast_to_user(user_id, payload)
