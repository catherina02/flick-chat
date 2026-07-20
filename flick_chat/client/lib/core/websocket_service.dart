import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'config.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final _eventsController = StreamController<Map<String, dynamic>>.broadcast();

  bool _connected = false;

  bool get isConnected => _connected;
  Stream<Map<String, dynamic>> get events => _eventsController.stream;

  Future<void> connect(String accessToken) async {
    await disconnect();
    final channel = WebSocketChannel.connect(AppConfig.wsChatUri(accessToken));
    _channel = channel;
    _connected = true;

    _subscription = channel.stream.listen(
      (event) {
        try {
          final decoded = jsonDecode(event as String) as Map<String, dynamic>;
          _eventsController.add(decoded);
        } catch (_) {}
      },
      onError: (_) {
        _connected = false;
      },
      onDone: () {
        _connected = false;
      },
    );
  }

  Future<void> disconnect() async {
    _connected = false;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
  }

  void joinConversation(int conversationId) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode({
      'type': 'conversation.join',
      'conversation_id': conversationId,
    }));
  }

  void sendMessage({
    required int conversationId,
    required String body,
  }) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode({
      'type': 'message.send',
      'conversation_id': conversationId,
      'body': body,
    }));
  }

  void sendTyping({
    required int conversationId,
    required bool isTyping,
  }) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode({
      'type': isTyping ? 'typing.start' : 'typing.stop',
      'conversation_id': conversationId,
    }));
  }

  void markConversationRead(int conversationId) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode({
      'type': 'message.read',
      'conversation_id': conversationId,
    }));
  }

  Future<void> dispose() async {
    await disconnect();
    await _eventsController.close();
  }
}
