from django.utils import timezone

from apps.accounts.models import Profile

from .models import ConversationMember


def should_notify_user(*, user, conversation, message, membership: ConversationMember | None) -> bool:
    profile = getattr(user, "profile", None)
    if profile is None:
        return True

    if membership and membership.notification_level == ConversationMember.MUTE:
        if not message.is_urgent:
            return False

    if membership and membership.notification_level == ConversationMember.MENTIONS:
        if not message.is_urgent and f"@{user.username}" not in message.body:
            return False

    if message.is_urgent:
        return True

    if profile.dnd_enabled:
        return False

    if profile.work_hours_start and profile.work_hours_end:
        now = timezone.localtime()
        current = now.time()
        start = profile.work_hours_start
        end = profile.work_hours_end
        if start <= end:
            outside = current < start or current >= end
        else:
            outside = end <= current < start
        if outside:
            return False

    return True
