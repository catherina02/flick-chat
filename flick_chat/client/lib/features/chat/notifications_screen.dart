import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/chat_models.dart';
import '../../core/chat_service.dart';
import '../chat/chat_detail_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await context.read<ChatService>().loadNotifications();
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _openNotification(AppNotification notification) async {
    final chat = context.read<ChatService>();
    if (!notification.isRead) {
      await chat.markNotificationRead(notification.id);
    }

    if (!mounted || notification.conversationId == null) return;

    final conversation = chat.conversations.firstWhere(
      (item) => item.id == notification.conversationId,
      orElse: () => ConversationSummary(
        id: notification.conversationId!,
        type: 'direct',
        name: notification.title,
      ),
    );

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(conversation: conversation),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (chat.unreadNotificationCount > 0)
            TextButton(
              onPressed: () => chat.markAllNotificationsRead(),
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : chat.notifications.isEmpty
                  ? const Center(child: Text('No notifications yet.'))
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: chat.notifications.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final notification = chat.notifications[index];
                        return Material(
                          color: notification.isRead
                              ? Colors.white
                              : const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _openNotification(notification),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    notification.title,
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(notification.body),
                                  const SizedBox(height: 6),
                                  Text(
                                    notification.createdAt.toLocal().toString(),
                                    style: Theme.of(context).textTheme.labelSmall,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
