import 'package:flutter/material.dart';

import 'api_client.dart';

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.senderName,
    required this.body,
    required this.createdAt,
    this.messageType = 'text',
    this.attachmentUrl,
    this.fileName = '',
    this.readByUserIds = const [],
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>?;
    final readByRaw = json['read_by'];
    final readBy = readByRaw is List
        ? readByRaw.map((item) => item as int).toList()
        : <int>[];

    return ChatMessage(
      id: json['id'] as int,
      conversationId: json['conversation_id'] as int? ?? json['conversation'] as int,
      senderId: sender?['id'] as int? ?? json['sender_id'] as int,
      senderName: sender?['username'] as String? ?? json['sender'] as String? ?? '',
      body: json['body'] as String? ?? '',
      messageType: json['message_type'] as String? ?? 'text',
      attachmentUrl: json['attachment_url'] as String?,
      fileName: json['file_name'] as String? ?? '',
      createdAt: DateTime.parse(json['created_at'] as String),
      readByUserIds: readBy,
    );
  }

  final int id;
  final int conversationId;
  final int senderId;
  final String senderName;
  final String body;
  final String messageType;
  final String? attachmentUrl;
  final String fileName;
  final DateTime createdAt;
  final List<int> readByUserIds;

  bool get isImage => messageType == 'image';
  bool get isFile => messageType == 'file';

  bool isMine(int currentUserId) => senderId == currentUserId;

  String get timeLabel {
    final local = createdAt.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  String get previewText {
    if (isImage) return '📷 Image';
    if (isFile) return '📎 ${fileName.isNotEmpty ? fileName : 'File'}';
    return body;
  }

  String receiptLabel(int expectedReaders) {
    if (expectedReaders <= 0) return '';
    if (readByUserIds.isEmpty) return '✓';
    if (readByUserIds.length >= expectedReaders) return '✓✓';
    return '✓✓';
  }

  ChatMessage copyWithReadBy(List<int> readBy) {
    return ChatMessage(
      id: id,
      conversationId: conversationId,
      senderId: senderId,
      senderName: senderName,
      body: body,
      messageType: messageType,
      attachmentUrl: attachmentUrl,
      fileName: fileName,
      createdAt: createdAt,
      readByUserIds: readBy,
    );
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.notificationType,
    required this.title,
    required this.body,
    this.conversationId,
    this.isRead = false,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as int,
      notificationType: json['notification_type'] as String? ?? 'message',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      conversationId: json['conversation'] as int?,
      isRead: json['is_read'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  final int id;
  final String notificationType;
  final String title;
  final String body;
  final int? conversationId;
  final bool isRead;
  final DateTime createdAt;
}

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.type,
    this.name,
    this.otherUser,
    this.members = const [],
    this.lastMessage,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    final otherUserJson = json['other_user'] as Map<String, dynamic>?;
    final lastMessageJson = json['last_message'] as Map<String, dynamic>?;
    final membersJson = json['members'] as List<dynamic>? ?? const [];

    return ConversationSummary(
      id: json['id'] as int,
      type: json['type'] as String? ?? 'direct',
      name: json['name'] as String?,
      otherUser: otherUserJson == null ? null : AppUser.fromJson(otherUserJson),
      members: membersJson
          .map((item) => AppUser.fromJson(
                (item as Map<String, dynamic>)['user'] as Map<String, dynamic>,
              ))
          .toList(),
      lastMessage: lastMessageJson == null
          ? null
          : ChatMessage.fromJson({
              ...lastMessageJson,
              'conversation_id': json['id'],
            }),
    );
  }

  final int id;
  final String type;
  final String? name;
  final AppUser? otherUser;
  final List<AppUser> members;
  final ChatMessage? lastMessage;

  bool get isGroup => type == 'group';

  int get expectedReadersForSender {
    final memberCount = members.isNotEmpty ? members.length : (isGroup ? 0 : 2);
    return memberCount > 0 ? memberCount - 1 : 1;
  }

  String get title {
    if (isGroup) {
      final groupName = name?.trim();
      return groupName != null && groupName.isNotEmpty ? groupName : 'Group Chat';
    }
    return otherUser?.username ?? 'Chat';
  }

  String get subtitle {
    if (lastMessage != null) {
      return lastMessage!.previewText;
    }
    if (isGroup) {
      final count = members.isNotEmpty ? members.length : null;
      return count == null ? 'Group chat' : '$count members';
    }
    return otherUser?.isOnline == true ? 'Online' : 'Offline';
  }

  Color get avatarColor {
    if (isGroup) {
      return colorForUser(id);
    }
    return colorForUser(otherUser?.id ?? id);
  }
}

Color colorForUser(int id) {
  const colors = [
    Color(0xFF475569),
    Color(0xFF1D4ED8),
    Color(0xFF0F766E),
    Color(0xFF9A3412),
    Color(0xFF7C3AED),
    Color(0xFF0369A1),
    Color(0xFFB45309),
  ];
  return colors[id.abs() % colors.length];
}

String userInitial(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return '?';
  return trimmed.substring(0, 1).toUpperCase();
}
