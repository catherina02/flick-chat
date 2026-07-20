from django.urls import path

from .views import (
    ConversationDeleteView,
    ConversationListView,
    ConversationMediaListView,
    DirectConversationCreateView,
    GroupConversationCreateView,
    MarkConversationReadView,
    MessageAttachmentView,
    MessageDeleteView,
    MessageEditView,
    MessageListView,
    MessageUploadView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
    UserListView,
)

urlpatterns = [
    path("users/", UserListView.as_view(), name="chat-users"),
    path("conversations/", ConversationListView.as_view(), name="chat-conversations"),
    path(
        "conversations/direct/",
        DirectConversationCreateView.as_view(),
        name="chat-direct-create",
    ),
    path(
        "conversations/group/",
        GroupConversationCreateView.as_view(),
        name="chat-group-create",
    ),
    path(
        "conversations/<int:conversation_id>/messages/",
        MessageListView.as_view(),
        name="chat-messages",
    ),
    path(
        "conversations/<int:conversation_id>/media/",
        ConversationMediaListView.as_view(),
        name="chat-media",
    ),
    path(
        "conversations/<int:conversation_id>/",
        ConversationDeleteView.as_view(),
        name="chat-conversation-delete",
    ),
    path(
        "conversations/<int:conversation_id>/upload/",
        MessageUploadView.as_view(),
        name="chat-upload",
    ),
    path(
        "messages/<int:message_id>/attachment/",
        MessageAttachmentView.as_view(),
        name="chat-message-attachment",
    ),
    path(
        "messages/<int:message_id>/",
        MessageEditView.as_view(),
        name="chat-message-edit",
    ),
    path(
        "messages/<int:message_id>/delete/",
        MessageDeleteView.as_view(),
        name="chat-message-delete",
    ),
    path(
        "conversations/<int:conversation_id>/read/",
        MarkConversationReadView.as_view(),
        name="chat-mark-read",
    ),
    path("notifications/", NotificationListView.as_view(), name="chat-notifications"),
    path(
        "notifications/unread-count/",
        NotificationUnreadCountView.as_view(),
        name="chat-notifications-unread-count",
    ),
    path(
        "notifications/read-all/",
        NotificationMarkAllReadView.as_view(),
        name="chat-notifications-read-all",
    ),
    path(
        "notifications/<int:notification_id>/read/",
        NotificationMarkReadView.as_view(),
        name="chat-notification-read",
    ),
]

