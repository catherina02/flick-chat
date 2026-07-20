import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'token_storage.dart';
import 'chat_models.dart';

class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.isOnline,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as int,
      username: json['username'] as String,
      email: json['email'] as String,
      isOnline: json['is_online'] as bool? ?? false,
    );
  }

  final int id;
  final String username;
  final String email;
  final bool isOnline;
}

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client, TokenStorage? tokenStorage})
      : _client = client ?? http.Client(),
        _tokenStorage = tokenStorage ?? TokenStorage();

  final http.Client _client;
  final TokenStorage _tokenStorage;

  String? _accessToken;
  String? _refreshToken;

  void setTokens({required String access, required String refresh}) {
    _accessToken = access;
    _refreshToken = refresh;
  }

  Future<void> register({
    required String username,
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.authBaseUrl}/register/'),
      headers: _jsonHeaders(),
      body: jsonEncode({
        'username': username,
        'email': email,
        'password': password,
        'password_confirm': password,
      }),
    );

    _throwIfError(response);
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.authBaseUrl}/login/'),
      headers: _jsonHeaders(),
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    _throwIfError(response);
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    _accessToken = data['access'] as String;
    _refreshToken = data['refresh'] as String;
    await _tokenStorage.saveTokens(
      access: _accessToken!,
      refresh: _refreshToken!,
    );
  }

  Future<void> refreshTokens() async {
    final refresh = _refreshToken ?? await _tokenStorage.readRefresh();
    if (refresh == null) {
      throw ApiException('No refresh token available.');
    }

    final response = await _client.post(
      Uri.parse('${AppConfig.authBaseUrl}/refresh/'),
      headers: _jsonHeaders(),
      body: jsonEncode({'refresh': refresh}),
    );

    _throwIfError(response);
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    _accessToken = data['access'] as String;
    if (data['refresh'] is String) {
      _refreshToken = data['refresh'] as String;
    }
    await _tokenStorage.saveTokens(
      access: _accessToken!,
      refresh: _refreshToken!,
    );
  }

  Future<void> logout() async {
    final refresh = _refreshToken ?? await _tokenStorage.readRefresh();
    if (_accessToken != null && refresh != null) {
      await _client.post(
        Uri.parse('${AppConfig.authBaseUrl}/logout/'),
        headers: _authHeaders(),
        body: jsonEncode({'refresh': refresh}),
      );
    }
    _accessToken = null;
    _refreshToken = null;
    await _tokenStorage.clear();
  }

  Future<AppUser> fetchMe() async {
    final response = await _authorizedGet('${AppConfig.authBaseUrl}/me/');
    return AppUser.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<List<AppUser>> fetchUsers() async {
    final response = await _authorizedGet('${AppConfig.chatBaseUrl}/users/');
    final data = jsonDecode(response.body) as List<dynamic>;
    return data
        .map((item) => AppUser.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<ConversationSummary>> fetchConversations() async {
    final response = await _authorizedGet('${AppConfig.chatBaseUrl}/conversations/');
    final data = jsonDecode(response.body) as List<dynamic>;
    return data
        .map((item) => ConversationSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<ConversationSummary> createDirectConversation(int userId) async {
    final response = await _authorizedPost(
      '${AppConfig.chatBaseUrl}/conversations/direct/',
      {'user_id': userId},
    );
    return ConversationSummary.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  Future<ConversationSummary> createGroupConversation({
    required String name,
    required List<int> memberIds,
  }) async {
    final response = await _authorizedPost(
      '${AppConfig.chatBaseUrl}/conversations/group/',
      {
        'name': name,
        'member_ids': memberIds,
      },
    );
    return ConversationSummary.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  Future<List<ChatMessage>> fetchMessages(int conversationId) async {
    final response = await _authorizedGet(
      '${AppConfig.chatBaseUrl}/conversations/$conversationId/messages/',
    );
    final data = jsonDecode(response.body) as List<dynamic>;
    return data
        .map((item) => ChatMessage.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<ChatMessage> uploadFile({
    required int conversationId,
    required File file,
    String body = '',
  }) async {
    await _ensureAccessToken();
    final uri = Uri.parse('${AppConfig.chatBaseUrl}/conversations/$conversationId/upload/');
    final request = http.MultipartRequest('POST', uri)
      ..headers.addAll({'Authorization': 'Bearer $_accessToken'})
      ..files.add(await http.MultipartFile.fromPath('file', file.path));

    if (body.trim().isNotEmpty) {
      request.fields['body'] = body.trim();
    }

    var streamed = await _client.send(request);
    var response = await http.Response.fromStream(streamed);

    if (response.statusCode == 401) {
      await refreshTokens();
      final retry = http.MultipartRequest('POST', uri)
        ..headers.addAll({'Authorization': 'Bearer $_accessToken'})
        ..files.add(await http.MultipartFile.fromPath('file', file.path));
      if (body.trim().isNotEmpty) {
        retry.fields['body'] = body.trim();
      }
      streamed = await _client.send(retry);
      response = await http.Response.fromStream(streamed);
    }

    _throwIfError(response);
    return ChatMessage.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<void> markConversationRead(int conversationId) async {
    await _authorizedPost(
      '${AppConfig.chatBaseUrl}/conversations/$conversationId/read/',
      {},
    );
  }

  Future<List<AppNotification>> fetchNotifications() async {
    final response = await _authorizedGet('${AppConfig.chatBaseUrl}/notifications/');
    final data = jsonDecode(response.body) as List<dynamic>;
    return data
        .map((item) => AppNotification.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<int> fetchUnreadNotificationCount() async {
    final response = await _authorizedGet('${AppConfig.chatBaseUrl}/notifications/unread-count/');
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['count'] as int? ?? 0;
  }

  Future<void> markNotificationRead(int notificationId) async {
    await _authorizedPost(
      '${AppConfig.chatBaseUrl}/notifications/$notificationId/read/',
      {},
    );
  }

  Future<void> markAllNotificationsRead() async {
    await _authorizedPost('${AppConfig.chatBaseUrl}/notifications/read-all/', {});
  }

  Future<void> registerDeviceToken({
    required String token,
    String platform = 'android',
  }) async {
    await _authorizedPost('${AppConfig.authBaseUrl}/device-token/', {
      'token': token,
      'platform': platform,
    });
  }

  String? get accessToken => _accessToken;

  Future<http.Response> _authorizedGet(String url) async {
    await _ensureAccessToken();
    var response = await _client.get(Uri.parse(url), headers: _authHeaders());
    if (response.statusCode == 401) {
      await refreshTokens();
      response = await _client.get(Uri.parse(url), headers: _authHeaders());
    }
    _throwIfError(response);
    return response;
  }

  Future<http.Response> _authorizedPost(
    String url,
    Map<String, dynamic> body,
  ) async {
    await _ensureAccessToken();
    var response = await _client.post(
      Uri.parse(url),
      headers: _authHeaders(),
      body: jsonEncode(body),
    );
    if (response.statusCode == 401) {
      await refreshTokens();
      response = await _client.post(
        Uri.parse(url),
        headers: _authHeaders(),
        body: jsonEncode(body),
      );
    }
    _throwIfError(response);
    return response;
  }

  Future<void> _ensureAccessToken() async {
    _accessToken ??= await _tokenStorage.readAccess();
    _refreshToken ??= await _tokenStorage.readRefresh();
    if (_accessToken == null) {
      throw ApiException('Not authenticated.');
    }
  }

  Map<String, String> _jsonHeaders() => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  Map<String, String> _authHeaders() => {
        ..._jsonHeaders(),
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  void _throwIfError(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    String message = 'Request failed (${response.statusCode}).';
    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic>) {
        if (body['detail'] is String) {
          message = body['detail'] as String;
        } else {
          message = body.values
              .expand((value) => value is List ? value : [value])
              .map((value) => value.toString())
              .join('\n');
        }
      }
    } catch (_) {}

    throw ApiException(message, statusCode: response.statusCode);
  }
}
