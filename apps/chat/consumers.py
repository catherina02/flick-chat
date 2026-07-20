import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone as django_timezone

from apps.accounts.models import Profile
from apps.chat.models import ConversationMember, Message, MessageRead
from apps.chat.services import broadcast_message, message_payload


@database_sync_to_async
def set_user_online(user_id: int, is_online: bool) -> None:
    Profile.objects.filter(user_id=user_id).update(
        is_online=is_online,
        last_seen=None if is_online else django_timezone.now(),
    )


@database_sync_to_async
def get_user_conversation_ids(user_id: int) -> list[int]:
    return list(
        ConversationMember.objects.filter(user_id=user_id).values_list(
            "conversation_id",
            flat=True,
        )
    )


@database_sync_to_async
def user_in_conversation(user_id: int, conversation_id: int) -> bool:
    return ConversationMember.objects.filter(
        user_id=user_id,
        conversation_id=conversation_id,
    ).exists()


@database_sync_to_async
def create_message(
    user_id: int,
    username: str,
    conversation_id: int,
    body: str,
) -> dict | None:
    if not ConversationMember.objects.filter(
        user_id=user_id,
        conversation_id=conversation_id,
    ).exists():
        return None

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender_id=user_id,
        body=body,
        message_type=Message.TEXT,
    )
    message.conversation.save(update_fields=["updated_at"])

    broadcast_message(message)
    return message_payload(message)


@database_sync_to_async
def mark_conversation_read(user_id: int, conversation_id: int) -> list[dict]:
    if not ConversationMember.objects.filter(
        user_id=user_id,
        conversation_id=conversation_id,
    ).exists():
        return []

    messages = Message.objects.filter(conversation_id=conversation_id).exclude(sender_id=user_id)
    updates = []
    for message in messages:
        _, created = MessageRead.objects.get_or_create(message=message, user_id=user_id)
        if created:
            read_by = list(
                message.reads.exclude(user_id=message.sender_id).values_list("user_id", flat=True)
            )
            updates.append(
                {
                    "type": "message.read_update",
                    "message_id": message.id,
                    "conversation_id": conversation_id,
                    "read_by": read_by,
                }
            )
    return updates


class ChatConsumer(AsyncWebsocketConsumer):
    presence_group = "presence_global"

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user = user
        self.user_group = f"user_{user.id}"
        self.joined_groups: set[str] = set()

        await self.channel_layer.group_add(self.user_group, self.channel_name)
        self.joined_groups.add(self.user_group)
        await self.channel_layer.group_add(self.presence_group, self.channel_name)
        self.joined_groups.add(self.presence_group)

        conversation_ids = await get_user_conversation_ids(user.id)
        for conversation_id in conversation_ids:
            group_name = f"conv_{conversation_id}"
            await self.channel_layer.group_add(group_name, self.channel_name)
            self.joined_groups.add(group_name)

        await set_user_online(user.id, True)
        await self.accept()

        await self.channel_layer.group_send(
            self.presence_group,
            {
                "type": "presence.update",
                "payload": {
                    "type": "presence",
                    "user_id": user.id,
                    "username": user.username,
                    "status": "online",
                },
            },
        )

    async def disconnect(self, close_code):
        if not hasattr(self, "user") or not self.user.is_authenticated:
            return

        for group_name in getattr(self, "joined_groups", set()):
            await self.channel_layer.group_discard(group_name, self.channel_name)

        await set_user_online(self.user.id, False)
        await self.channel_layer.group_send(
            self.presence_group,
            {
                "type": "presence.update",
                "payload": {
                    "type": "presence",
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "status": "offline",
                },
            },
        )

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = payload.get("type")

        if event_type == "conversation.join":
            conversation_id = payload.get("conversation_id")
            if conversation_id and await user_in_conversation(self.user.id, conversation_id):
                group_name = f"conv_{conversation_id}"
                if group_name not in self.joined_groups:
                    await self.channel_layer.group_add(group_name, self.channel_name)
                    self.joined_groups.add(group_name)
            return

        if event_type == "message.send":
            conversation_id = payload.get("conversation_id")
            body = (payload.get("body") or "").strip()
            if not conversation_id or not body:
                return

            await create_message(
                self.user.id,
                self.user.username,
                conversation_id,
                body,
            )
            return

        if event_type == "message.read":
            conversation_id = payload.get("conversation_id")
            if not conversation_id:
                return

            updates = await mark_conversation_read(self.user.id, conversation_id)
            for update in updates:
                await self.channel_layer.group_send(
                    f"conv_{conversation_id}",
                    {"type": "chat.read_update", "payload": update},
                )
            return

        if event_type in ("typing.start", "typing.stop"):
            conversation_id = payload.get("conversation_id")
            if not conversation_id:
                return
            if not await user_in_conversation(self.user.id, conversation_id):
                return

            await self.channel_layer.group_send(
                f"conv_{conversation_id}",
                {
                    "type": "chat.typing",
                    "payload": {
                        "type": "typing",
                        "conversation_id": conversation_id,
                        "user_id": self.user.id,
                        "username": self.user.username,
                        "is_typing": event_type == "typing.start",
                    },
                },
            )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def chat_typing(self, event):
        if event["payload"].get("user_id") == self.user.id:
            return
        await self.send(text_data=json.dumps(event["payload"]))

    async def chat_read_update(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def presence_update(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def user_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
