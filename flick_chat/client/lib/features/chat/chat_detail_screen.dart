import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth_service.dart';
import '../../core/chat_models.dart';
import '../../core/chat_service.dart';

class ChatDetailScreen extends StatefulWidget {
  const ChatDetailScreen({
    super.key,
    required this.conversation,
  });

  final ConversationSummary conversation;

  @override
  State<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<ChatDetailScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _typingTimer;
  ChatService? _chatService;
  bool _loading = true;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _chatService ??= context.read<ChatService>();
  }

  @override
  void initState() {
    super.initState();
    _messageController.addListener(_onTextChanged);
    _loadMessages();
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
    _chatService?.sendTyping(
      conversationId: widget.conversation.id,
      isTyping: false,
    );
    _messageController
      ..removeListener(_onTextChanged)
      ..dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final chat = context.read<ChatService>();
    final hasText = _messageController.text.trim().isNotEmpty;
    chat.sendTyping(conversationId: widget.conversation.id, isTyping: hasText);
    _typingTimer?.cancel();
    if (hasText) {
      _typingTimer = Timer(const Duration(seconds: 2), () {
        chat.sendTyping(conversationId: widget.conversation.id, isTyping: false);
      });
    }
  }

  Future<void> _loadMessages() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await context.read<ChatService>().loadMessages(widget.conversation.id);
      _scrollToBottom();
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    context.read<ChatService>().sendMessage(widget.conversation.id, text);
    _messageController.clear();
    _scrollToBottom();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (image == null || !mounted) return;

    setState(() => _loading = true);
    try {
      await context.read<ChatService>().uploadFile(
            conversationId: widget.conversation.id,
            file: File(image.path),
          );
      _scrollToBottom();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(withReadStream: false);
    if (result == null || result.files.single.path == null || !mounted) return;

    setState(() => _loading = true);
    try {
      await context.read<ChatService>().uploadFile(
            conversationId: widget.conversation.id,
            file: File(result.files.single.path!),
          );
      _scrollToBottom();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _messageBody(ChatMessage message, bool isMe, ChatService chatService) {
    final attachmentUrl = chatService.attachmentUrlFor(message);

    if (message.isImage && attachmentUrl.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => _openUrl(attachmentUrl),
          child: Image.network(
            attachmentUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Text(message.fileName),
          ),
        ),
      );
    }

    if (message.isFile && attachmentUrl.isNotEmpty) {
      return InkWell(
        onTap: () => _openUrl(attachmentUrl),
        child: Text(
          '📎 ${message.fileName.isNotEmpty ? message.fileName : 'Download file'}',
          style: TextStyle(
            color: isMe ? Colors.white : const Color(0xFF1D4ED8),
            decoration: TextDecoration.underline,
          ),
        ),
      );
    }

    return Text(
      message.body,
      style: TextStyle(
        color: isMe ? Colors.white : const Color(0xFF0F172A),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatService = context.watch<ChatService>();
    final currentUserId = context.read<AuthService>().user?.id ?? 0;
    final messages = chatService.messagesFor(widget.conversation.id);
    final conversation = widget.conversation;
    final typingUser = chatService.typingLabelFor(conversation.id);
    final subtitle = typingUser != null
        ? '$typingUser is typing...'
        : conversation.subtitle;

    if (!_loading && _error == null && messages.isNotEmpty) {
      _scrollToBottom();
    }

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: conversation.avatarColor.withValues(alpha: 0.12),
              foregroundColor: conversation.avatarColor,
              child: conversation.isGroup
                  ? const Icon(Icons.groups_rounded, size: 18)
                  : Text(userInitial(conversation.title)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(conversation.title),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: typingUser != null
                              ? const Color(0xFF1D4ED8)
                              : const Color(0xFF64748B),
                          fontStyle: typingUser != null
                              ? FontStyle.italic
                              : FontStyle.normal,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Color(0xFF991B1B)),
                          ),
                        ),
                      )
                    : messages.isEmpty
                        ? const Center(
                            child: Text(
                              'No messages yet. Say hello!',
                              style: TextStyle(color: Color(0xFF64748B)),
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.all(16),
                            itemCount: messages.length,
                            itemBuilder: (context, index) {
                              final message = messages[index];
                              final isMe = message.isMine(currentUserId);
                              final showSenderName =
                                  conversation.isGroup && !isMe;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Align(
                                  alignment: isMe
                                      ? Alignment.centerRight
                                      : Alignment.centerLeft,
                                  child: ConstrainedBox(
                                    constraints: const BoxConstraints(maxWidth: 280),
                                    child: Column(
                                      crossAxisAlignment: isMe
                                          ? CrossAxisAlignment.end
                                          : CrossAxisAlignment.start,
                                      children: [
                                        if (showSenderName) ...[
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              left: 4,
                                              bottom: 4,
                                            ),
                                            child: Text(
                                              message.senderName,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelMedium
                                                  ?.copyWith(
                                                    color: colorForUser(
                                                      message.senderId,
                                                    ),
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                            ),
                                          ),
                                        ],
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 14,
                                            vertical: 12,
                                          ),
                                          decoration: BoxDecoration(
                                            color: isMe
                                                ? const Color(0xFF1E293B)
                                                : Colors.white,
                                            borderRadius: BorderRadius.circular(18),
                                            border: Border.all(
                                              color: const Color(0xFFE2E8F0),
                                            ),
                                          ),
                                          child: _messageBody(message, isMe, chatService),
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              message.timeLabel,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall
                                                  ?.copyWith(
                                                    color: const Color(0xFF64748B),
                                                  ),
                                            ),
                                            if (isMe) ...[
                                              const SizedBox(width: 6),
                                              Text(
                                                message.receiptLabel(
                                                  conversation.expectedReadersForSender,
                                                ),
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .labelSmall
                                                    ?.copyWith(
                                                      color: message.readByUserIds
                                                              .isNotEmpty
                                                          ? const Color(0xFF38BDF8)
                                                          : const Color(0xFF94A3B8),
                                                      fontWeight: FontWeight.w700,
                                                    ),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(
                top: BorderSide(color: Color(0xFFE2E8F0)),
              ),
            ),
            child: Row(
              children: [
                IconButton(
                  onPressed: _pickImage,
                  icon: const Icon(Icons.image_outlined),
                ),
                IconButton(
                  onPressed: _pickFile,
                  icon: const Icon(Icons.attach_file_rounded),
                ),
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendMessage(),
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      filled: true,
                      fillColor: const Color(0xFFF8FAFC),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Material(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    onTap: _sendMessage,
                    borderRadius: BorderRadius.circular(14),
                    child: const SizedBox(
                      width: 48,
                      height: 48,
                      child: Icon(Icons.send_rounded, color: Colors.white),
                    ),
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
