from rest_framework.exceptions import PermissionDenied

from .models import Conversation, ConversationMember


def get_membership(user, conversation_id: int) -> ConversationMember | None:
    return ConversationMember.objects.filter(
        conversation_id=conversation_id,
        user=user,
    ).first()


def require_member(user, conversation_id: int) -> ConversationMember:
    membership = get_membership(user, conversation_id)
    if membership is None:
        raise PermissionDenied("Conversation not found.")
    return membership


def require_admin(user, conversation_id: int) -> ConversationMember:
    membership = require_member(user, conversation_id)
    if membership.role != ConversationMember.ADMIN and not user.is_superuser:
        raise PermissionDenied("Admin access required.")
    return membership


def can_post_message(conversation: Conversation, membership: ConversationMember) -> bool:
    if membership.role == ConversationMember.GUEST:
        return False
    if conversation.is_locked and membership.role != ConversationMember.ADMIN:
        return False
    return True


def can_moderate_message(user, membership: ConversationMember | None, message) -> bool:
    if message.sender_id == user.id:
        return True
    if user.is_superuser:
        return True
    if membership and membership.role == ConversationMember.ADMIN:
        return True
    return False
