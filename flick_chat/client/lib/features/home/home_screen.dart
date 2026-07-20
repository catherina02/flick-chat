import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/auth_service.dart';
import '../../core/chat_models.dart';
import '../../core/chat_service.dart';
import '../chat/chat_detail_screen.dart';
import '../chat/create_group_screen.dart';
import '../chat/notifications_screen.dart';

class FriendChat {
  const FriendChat({
    required this.name,
    required this.message,
    required this.time,
    required this.unread,
    required this.color,
    required this.online,
    this.messages = const [],
  });

  final String name;
  final String message;
  final String time;
  final int unread;
  final Color color;
  final bool online;
  final List<ChatBubbleData>? messages;
}

class Contact {
  const Contact({
    required this.name,
    required this.status,
    required this.color,
    required this.online,
  });

  final String name;
  final String status;
  final Color color;
  final bool online;
}

class ChatBubbleData {
  const ChatBubbleData({
    required this.text,
    required this.isMe,
    required this.time,
  });

  final String text;
  final bool isMe;
  final String time;
}

class FeedPost {
  const FeedPost({
    required this.author,
    required this.caption,
    required this.time,
    required this.color,
  });

  final String author;
  final String caption;
  final String time;
  final Color color;
}

class ScheduleItem {
  const ScheduleItem({
    required this.title,
    required this.time,
    required this.note,
  });

  final String title;
  final String time;
  final String note;
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  final List<FeedPost> _feedPosts = const [
    FeedPost(
      author: 'Alya',
      caption: 'Shared new event photos in the group.',
      time: '10 min ago',
      color: Color(0xFF475569),
    ),
    FeedPost(
      author: 'Gita',
      caption: 'Posted a study reminder for tomorrow morning.',
      time: '1 hour ago',
      color: Color(0xFF1D4ED8),
    ),
  ];

  final List<ScheduleItem> _schedule = const [
    ScheduleItem(
      title: 'Team Standup',
      time: '09:00 AM',
      note: 'Daily progress sync with the chat team.',
    ),
    ScheduleItem(
      title: 'Design Review',
      time: '01:30 PM',
      note: 'Review new messaging UI ideas.',
    ),
    ScheduleItem(
      title: 'Call with Alya',
      time: '07:00 PM',
      note: 'Discuss project timeline and next tasks.',
    ),
  ];

  int _currentTab = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.user;
    final connected = auth.webSocket.isConnected;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Flick Chat'),
            if (user != null)
              Text(
                user.username,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: const Color(0xFF64748B),
                    ),
              ),
          ],
        ),
        centerTitle: false,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: connected ? const Color(0xFF15803D) : const Color(0xFF94A3B8),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  connected ? 'Live' : 'Offline',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: const Color(0xFF64748B),
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentTab,
        children: [
          const _ChatsTab(),
          const _ContactsTab(),
          _FeedTab(posts: _feedPosts),
          _ScheduleTab(items: _schedule),
          const _SettingsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTab,
        onDestinationSelected: (index) => setState(() => _currentTab = index),
        destinations: const [
          NavigationDestination(
            key: ValueKey('tab-chat'),
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
          NavigationDestination(
            key: ValueKey('tab-contact'),
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Contact',
          ),
          NavigationDestination(
            key: ValueKey('tab-feed'),
            icon: Icon(Icons.dynamic_feed_outlined),
            selectedIcon: Icon(Icons.dynamic_feed),
            label: 'Feed',
          ),
          NavigationDestination(
            key: ValueKey('tab-schedule'),
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Schedule',
          ),
          NavigationDestination(
            key: ValueKey('tab-setting'),
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Setting',
          ),
        ],
      ),
    );
  }
}

class _ChatsTab extends StatefulWidget {
  const _ChatsTab();

  @override
  State<_ChatsTab> createState() => _ChatsTabState();
}

class _ChatsTabState extends State<_ChatsTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatService>().loadConversations();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatService = context.watch<ChatService>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: chatService.loadConversations,
        child: ListView(
          padding: const EdgeInsets.all(16),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const _SectionHeader(
              title: 'Chat',
              subtitle: 'Your recent conversations',
            ),
            const SizedBox(height: 12),
            if (chatService.loadingConversations && chatService.conversations.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (chatService.conversationsError != null &&
                chatService.conversations.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  chatService.conversationsError!,
                  style: const TextStyle(color: Color(0xFF991B1B)),
                ),
              )
            else if (chatService.conversations.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'No conversations yet. Start one from Contacts.',
                  style: TextStyle(color: Color(0xFF64748B)),
                ),
              )
            else
              for (final conversation in chatService.conversations) ...[
                _ConversationTile(
                  conversation: conversation,
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ChatDetailScreen(conversation: conversation),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 12),
              ],
          ],
        ),
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.extended(
            heroTag: 'new-group',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const CreateGroupScreen(),
                ),
              );
            },
            backgroundColor: Colors.white,
            foregroundColor: const Color(0xFF1E293B),
            icon: const Icon(Icons.groups_outlined),
            label: const Text('Group'),
          ),
          const SizedBox(height: 12),
          FloatingActionButton(
            key: const ValueKey('new-chat-button'),
            onPressed: () => _showNewChatContacts(context),
            backgroundColor: const Color(0xFF1E293B),
            foregroundColor: Colors.white,
            child: const Icon(Icons.add),
          ),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.onTap,
  });

  final ConversationSummary conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final otherUser = conversation.otherUser;
    final lastMessage = conversation.lastMessage;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.35)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x120F172A),
                blurRadius: 16,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: conversation.avatarColor.withValues(alpha: 0.12),
                foregroundColor: conversation.avatarColor,
                child: conversation.isGroup
                    ? const Icon(Icons.groups_rounded, size: 22)
                    : Text(userInitial(conversation.title)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF0F172A),
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      lastMessage?.body ?? conversation.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: const Color(0xFF64748B),
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (lastMessage != null)
                    Text(
                      lastMessage.timeLabel,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: const Color(0xFF64748B),
                          ),
                    )
                  else if (conversation.isGroup)
                    Text(
                      conversation.subtitle,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: const Color(0xFF64748B),
                          ),
                    )
                  else
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: otherUser?.isOnline == true
                            ? const Color(0xFF15803D)
                            : const Color(0xFF94A3B8),
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _showNewChatContacts(BuildContext context) {
  final chatService = context.read<ChatService>();
  chatService.loadUsers();

  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    backgroundColor: const Color(0xFFF8FAFC),
    builder: (context) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Start New Chat',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('close-new-chat'),
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Choose a contact to begin a conversation.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF64748B),
                    ),
              ),
              const SizedBox(height: 16),
              Flexible(
                child: Consumer<ChatService>(
                  builder: (context, chat, _) {
                    if (chat.loadingUsers && chat.users.isEmpty) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (chat.usersError != null && chat.users.isEmpty) {
                      return Text(
                        chat.usersError!,
                        style: const TextStyle(color: Color(0xFF991B1B)),
                      );
                    }
                    if (chat.users.isEmpty) {
                      return const Text(
                        'No other users registered yet.',
                        style: TextStyle(color: Color(0xFF64748B)),
                      );
                    }

                    return ListView.separated(
                      shrinkWrap: true,
                      itemCount: chat.users.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final user = chat.users[index];
                        return _NewChatUserTile(user: user);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _NewChatUserTile extends StatelessWidget {
  const _NewChatUserTile({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final color = colorForUser(user.id);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () async {
          Navigator.of(context).pop();
          try {
            final conversation =
                await context.read<ChatService>().startDirectChat(user.id);
            if (!context.mounted) return;
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChatDetailScreen(conversation: conversation),
              ),
            );
          } catch (error) {
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error.toString())),
            );
          }
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: color.withValues(alpha: 0.14),
                foregroundColor: color,
                child: Text(userInitial(user.username)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.username,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user.isOnline ? 'Online' : 'Offline',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: const Color(0xFF64748B),
                          ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContactsTab extends StatefulWidget {
  const _ContactsTab();

  @override
  State<_ContactsTab> createState() => _ContactsTabState();
}

class _ContactsTabState extends State<_ContactsTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatService>().loadUsers();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatService = context.watch<ChatService>();

    return RefreshIndicator(
      onRefresh: chatService.loadUsers,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const _SectionHeader(
            title: 'Contact',
            subtitle: 'Registered users you can chat with',
          ),
          const SizedBox(height: 12),
          if (chatService.loadingUsers && chatService.users.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (chatService.usersError != null && chatService.users.isEmpty)
            Text(
              chatService.usersError!,
              style: const TextStyle(color: Color(0xFF991B1B)),
            )
          else if (chatService.users.isEmpty)
            const Text(
              'No other users registered yet.',
              style: TextStyle(color: Color(0xFF64748B)),
            )
          else
            ...chatService.users.map(
              (user) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _UserContactTile(user: user),
              ),
            ),
        ],
      ),
    );
  }
}

class _UserContactTile extends StatelessWidget {
  const _UserContactTile({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final color = colorForUser(user.id);
    final cs = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.35)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: color.withValues(alpha: 0.16),
                foregroundColor: color,
                child: Text(userInitial(user.username)),
              ),
              Positioned(
                right: 1,
                bottom: 1,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: user.isOnline
                        ? const Color(0xFF15803D)
                        : const Color(0xFF94A3B8),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.username,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  user.isOnline ? 'Online' : 'Offline',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF64748B),
                      ),
                ),
              ],
            ),
          ),
          FilledButton.tonalIcon(
            onPressed: () async {
              try {
                final conversation =
                    await context.read<ChatService>().startDirectChat(user.id);
                if (!context.mounted) return;
                await Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => ChatDetailScreen(conversation: conversation),
                  ),
                );
              } catch (error) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(error.toString())),
                );
              }
            },
            icon: const Icon(Icons.chat_bubble_outline),
            label: const Text('Chat'),
          ),
        ],
      ),
    );
  }
}

class _FeedTab extends StatelessWidget {
  const _FeedTab({required this.posts});

  final List<FeedPost> posts;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionHeader(
          title: 'Feed',
          subtitle: 'Latest updates from your circle',
        ),
        const SizedBox(height: 12),
        ...posts.map((post) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _FeedCard(post: post),
            )),
      ],
    );
  }
}

class _ScheduleTab extends StatelessWidget {
  const _ScheduleTab({required this.items});

  final List<ScheduleItem> items;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionHeader(
          title: 'Schedule',
          subtitle: 'Your upcoming plans and reminders',
        ),
        const SizedBox(height: 12),
        ...items.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _ScheduleCard(item: item),
            )),
      ],
    );
  }
}

class _SettingsTab extends StatelessWidget {
  const _SettingsTab();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionHeader(
          title: 'Setting',
          subtitle: 'Manage your app preferences',
        ),
        if (user != null) ...[
          const SizedBox(height: 12),
          _SettingTile(
            icon: Icons.account_circle_outlined,
            title: user.username,
            subtitle: user.email,
          ),
        ],
        const SizedBox(height: 12),
        _SettingTile(
          icon: Icons.notifications_outlined,
          title: 'Notifications',
          subtitle: 'View message alerts and group invites',
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            );
          },
        ),
        const SizedBox(height: 12),
        const _SettingTile(
          icon: Icons.lock_outline,
          title: 'Privacy',
          subtitle: 'Manage blocked users and account privacy',
        ),
        const SizedBox(height: 12),
        const _SettingTile(
          icon: Icons.palette_outlined,
          title: 'Appearance',
          subtitle: 'Choose theme and display preferences',
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () => auth.logout(),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF991B1B),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          icon: const Icon(Icons.logout),
          label: const Text('Sign Out'),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cs.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

class _FeedCard extends StatelessWidget {
  const _FeedCard({required this.post});

  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.35)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: post.color.withOpacity(0.16),
                foregroundColor: post.color,
                child: Text(_initial(post.author)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  post.author,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              Text(
                post.time,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: const Color(0xFF64748B),
                    ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            post.caption,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF334155),
                ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({required this.item});

  final ScheduleItem item;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.35)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFE2E8F0),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              item.time.split(' ').first,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF0F172A),
                  ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  item.note,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF64748B),
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.35)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: const Color(0xFFE2E8F0),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: const Color(0xFF334155)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF64748B),
                      ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
        ),
      ),
    );
  }
}

String _initial(String text) {
  final value = text.trim();
  if (value.isEmpty) return '?';
  return value.substring(0, 1).toUpperCase();
}
