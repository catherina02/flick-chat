from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.chat.models import ScheduledMessage
from apps.chat.services import broadcast_message
from apps.chat.webhooks import dispatch_outgoing_webhooks
from apps.chat.models import Message


class Command(BaseCommand):
    help = "Deliver scheduled messages whose scheduled_at has passed."

    def handle(self, *args, **options):
        due = ScheduledMessage.objects.filter(delivered=False, scheduled_at__lte=timezone.now())
        count = 0
        for scheduled in due.select_related("conversation", "sender"):
            message = Message.objects.create(
                conversation=scheduled.conversation,
                sender=scheduled.sender,
                body=scheduled.body,
                message_type=Message.TEXT,
                parent=scheduled.parent,
                is_urgent=scheduled.is_urgent,
            )
            scheduled.conversation.save(update_fields=["updated_at"])
            scheduled.delivered = True
            scheduled.delivered_message = message
            scheduled.save(update_fields=["delivered", "delivered_message"])
            broadcast_message(message)
            dispatch_outgoing_webhooks(message)
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Delivered {count} scheduled message(s)."))
