import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'chat_models.dart';
import 'notification_service.dart';
import 'websocket_service.dart';

class ChatService extends ChangeNotifier {
  ChatService({
    required ApiClient api,
    required WebSocketService webSocket,
    NotificationService? notificationService,
  })  : _api = api,
        _webSocket = webSocket,
        _notifications = notificationService ?? NotificationService();

  final ApiClient _api;
  final WebSocketService _webSocket;
  final NotificationService _notifications;

  StreamSubscription<Map<String, dynamic>>? _subscription;
  int? _currentUserId;

  List<ConversationSummary> conversations = [];
  List<AppUser> users = [];
  List<AppNotification> notifications = [];
  int unreadNotificationCount = 0;
  final Map<int, List<ChatMessage>> messagesByConversation = {};
  final Map<int, String?> typingUsers = {};

  bool loadingConversations = false;
  bool loadingUsers = false;
  String? conversationsError;
  String? usersError;

  NotificationService get notificationService => _notifications;

  Future<void> initNotifications() async {
    await _notifications.initialize();
  }

  void attach({required int userId}) {
    if (_currentUserId == userId && _subscription != null) {
      return;
    }
    _currentUserId = userId;
    _subscription ??= _webSocket.events.listen(_handleWebSocketEvent);
    loadNotificationCount();
  }

  void detach() {
    _subscription?.cancel();
    _subscription = null;
    _currentUserId = null;
  }

  Future<void> loadConversations() async {
    loadingConversations = true;
    conversationsError = null;
    notifyListeners();

    try {
      conversations = await _api.fetchConversations();
    } catch (error) {
      conversationsError = error.toString();
    } finally {
      loadingConversations = false;
      notifyListeners();
    }
  }

  Future<void> loadUsers() async {
    loadingUsers = true;
    usersError = null;
    notifyListeners();

    try {
      users = await _api.fetchUsers();
    } catch (error) {
      usersError = error.toString();
    } finally {
      loadingUsers = false;
      notifyListeners();
    }
  }

  Future<void> loadNotifications() async {
    notifications = await _api.fetchNotifications();
    unreadNotificationCount = notifications.where((item) => !item.isRead).length;
    notifyListeners();
  }

  Future<void> loadNotificationCount() async {
    unreadNotificationCount = await _api.fetchUnreadNotificationCount();
    notifyListeners();
  }

  Future<void> markNotificationRead(int notificationId) async {
    await _api.markNotificationRead(notificationId);
    notifications = notifications
        .map((item) => item.id == notificationId ? AppNotification(
              id: item.id,
              notificationType: item.notificationType,
              title: item.title,
              body: item.body,
              conversationId: item.conversationId,
              isRead: true,
              createdAt: item.createdAt,
            ) : item)
        .toList();
    unreadNotificationCount = notifications.where((item) => !item.isRead).length;
    notifyListeners();
  }

  Future<void> markAllNotificationsRead() async {
    await _api.markAllNotificationsRead();
    notifications = notifications
        .map((item) => AppNotification(
              id: item.id,
              notificationType: item.notificationType,
              title: item.title,
              body: item.body,
              conversationId: item.conversationId,
              isRead: true,
              createdAt: item.createdAt,
            ))
        .toList();
    unreadNotificationCount = 0;
    notifyListeners();
  }

  Future<ConversationSummary> startDirectChat(int userId) async {
    final conversation = await _api.createDirectConversation(userId);
    _upsertConversation(conversation);
    return conversation;
  }

  Future<ConversationSummary> createGroupChat({
    required String name,
    required List<int> memberIds,
  }) async {
    final conversation = await _api.createGroupConversation(
      name: name,
      memberIds: memberIds,
    );
    _upsertConversation(conversation);
    return conversation;
  }

  void _upsertConversation(ConversationSummary conversation) {
    final existingIndex = conversations.indexWhere((item) => item.id == conversation.id);
    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations = [conversation, ...conversations];
    }
    _webSocket.joinConversation(conversation.id);
    notifyListeners();
  }

  Future<void> loadMessages(int conversationId) async {
    final messages = await _api.fetchMessages(conversationId);
    messagesByConversation[conversationId] = messages;
    _webSocket.joinConversation(conversationId);
    await markConversationRead(conversationId);
    notifyListeners();
  }

  Future<void> markConversationRead(int conversationId) async {
    await _api.markConversationRead(conversationId);
    _webSocket.markConversationRead(conversationId);
  }

  Future<void> uploadFile({
    required int conversationId,
    required File file,
    String body = '',
  }) async {
    final message = await _api.uploadFile(
      conversationId: conversationId,
      file: file,
      body: body,
    );
    _addMessage(message);
  }

  void sendMessage(int conversationId, String body) {
    final trimmed = body.trim();
    if (trimmed.isEmpty) {
      return;
    }
    sendTyping(conversationId: conversationId, isTyping: false);
    _webSocket.sendMessage(conversationId: conversationId, body: trimmed);
  }

  void sendTyping({required int conversationId, required bool isTyping}) {
    _webSocket.sendTyping(conversationId: conversationId, isTyping: isTyping);
  }

  String? typingLabelFor(int conversationId) {
    return typingUsers[conversationId];
  }

  List<ChatMessage> messagesFor(int conversationId) {
    return List<ChatMessage>.from(messagesByConversation[conversationId] ?? const []);
  }

  void _handleWebSocketEvent(Map<String, dynamic> event) {
    final type = event['type'] as String?;

    if (type == 'conversation.created') {
      final conversationJson = event['conversation'] as Map<String, dynamic>?;
      if (conversationJson != null) {
        _upsertConversation(ConversationSummary.fromJson(conversationJson));
      }
      return;
    }

    if (type == 'notification.new') {
      final notificationJson = event['notification'] as Map<String, dynamic>?;
      if (notificationJson != null) {
        final notification = AppNotification.fromJson(notificationJson);
        notifications = [notification, ...notifications];
        unreadNotificationCount += 1;
        _notifications.show(title: notification.title, body: notification.body);
        notifyListeners();
      }
      return;
    }

    if (type == 'message.new') {
      _addMessage(ChatMessage.fromJson(event));
      return;
    }

    if (type == 'message.read_update') {
      _updateReadReceipts(
        conversationId: event['conversation_id'] as int,
        messageId: event['message_id'] as int,
        readBy: (event['read_by'] as List<dynamic>).map((e) => e as int).toList(),
      );
      return;
    }

    if (type == 'typing') {
      final conversationId = event['conversation_id'] as int;
      final isTyping = event['is_typing'] as bool? ?? false;
      if (isTyping) {
        typingUsers[conversationId] = event['username'] as String?;
      } else if (typingUsers[conversationId] == event['username']) {
        typingUsers.remove(conversationId);
      }
      notifyListeners();
      return;
    }

    if (type == 'presence') {
      _updatePresence(
        userId: event['user_id'] as int,
        isOnline: event['status'] == 'online',
      );
    }
  }

  void _addMessage(ChatMessage message) {
    final existing = messagesByConversation.putIfAbsent(message.conversationId, () => []);
    if (existing.any((item) => item.id == message.id)) {
      return;
    }
    existing.add(message);

    final conversationIndex = conversations.indexWhere((item) => item.id == message.conversationId);
    if (conversationIndex >= 0) {
      final current = conversations[conversationIndex];
      conversations.removeAt(conversationIndex);
      conversations.insert(
        0,
        ConversationSummary(
          id: current.id,
          type: current.type,
          name: current.name,
          otherUser: current.otherUser,
          members: current.members,
          lastMessage: message,
        ),
      );
    }

    notifyListeners();
  }

  void _updateReadReceipts({
    required int conversationId,
    required int messageId,
    required List<int> readBy,
  }) {
    final messages = messagesByConversation[conversationId];
    if (messages == null) return;

    final index = messages.indexWhere((item) => item.id == messageId);
    if (index < 0) return;

    messages[index] = messages[index].copyWithReadBy(readBy);
    notifyListeners();
  }

  void _updatePresence({required int userId, required bool isOnline}) {
    var changed = false;

    users = users.map((user) {
      if (user.id != userId) {
        return user;
      }
      changed = true;
      return AppUser(
        id: user.id,
        username: user.username,
        email: user.email,
        isOnline: isOnline,
      );
    }).toList();

    conversations = conversations.map((conversation) {
      final other = conversation.otherUser;
      if (other == null || other.id != userId) {
        return conversation;
      }
      changed = true;
      return ConversationSummary(
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        otherUser: AppUser(
          id: other.id,
          username: other.username,
          email: other.email,
          isOnline: isOnline,
        ),
        members: conversation.members,
        lastMessage: conversation.lastMessage,
      );
    }).toList();

    if (changed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    detach();
    super.dispose();
  }
}
