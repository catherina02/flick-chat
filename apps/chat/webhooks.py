import json
import urllib.error
import urllib.request

from .models import Message, Webhook


def dispatch_outgoing_webhooks(message: Message) -> None:
    webhooks = Webhook.objects.filter(
        is_active=True,
        direction=Webhook.OUTGOING,
        conversation_id=message.conversation_id,
    )
    payload = {
        "event": "message.new",
        "conversation_id": message.conversation_id,
        "message_id": message.id,
        "sender": message.sender.username,
        "body": message.body,
        "message_type": message.message_type,
    }
    body = json.dumps(payload).encode()
    for webhook in webhooks:
        events = webhook.events or ["message.new"]
        if "message.new" not in events:
            continue
        if not webhook.url:
            continue
        try:
            req = urllib.request.Request(
                webhook.url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Secret": webhook.secret,
                },
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except (urllib.error.URLError, TimeoutError):
            continue


def post_incoming_message(conversation_id: int, sender_id: int, text: str, request=None) -> Message:
    from .services import broadcast_message

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender_id=sender_id,
        body=text,
        message_type=Message.TEXT,
    )
    message.conversation.save(update_fields=["updated_at"])
    broadcast_message(message, request=request)
    return message
