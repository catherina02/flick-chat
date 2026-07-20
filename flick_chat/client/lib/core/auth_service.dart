import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'token_storage.dart';
import 'websocket_service.dart';

class AuthService extends ChangeNotifier {
  AuthService({
    ApiClient? apiClient,
    TokenStorage? tokenStorage,
    WebSocketService? webSocketService,
  })  : _api = apiClient ?? ApiClient(),
        _tokenStorage = tokenStorage ?? TokenStorage(),
        _webSocket = webSocketService ?? WebSocketService();

  final ApiClient _api;
  final TokenStorage _tokenStorage;
  final WebSocketService _webSocket;

  bool _bootstrapping = true;
  bool _authenticated = false;
  AppUser? _user;

  bool get bootstrapping => _bootstrapping;
  bool get isAuthenticated => _authenticated;
  AppUser? get user => _user;
  WebSocketService get webSocket => _webSocket;
  ApiClient get api => _api;

  Future<void> bootstrap() async {
    final access = await _tokenStorage.readAccess();
    final refresh = await _tokenStorage.readRefresh();

    if (access != null && refresh != null) {
      _api.setTokens(access: access, refresh: refresh);
      try {
        _user = await _api.fetchMe();
        _authenticated = true;
        await _connectWebSocket();
      } catch (_) {
        try {
          await _api.refreshTokens();
          _user = await _api.fetchMe();
          _authenticated = true;
          await _connectWebSocket();
        } catch (_) {
          await _tokenStorage.clear();
        }
      }
    }

    _bootstrapping = false;
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await _api.login(email: email, password: password);
    _user = await _api.fetchMe();
    _authenticated = true;
    await _connectWebSocket();
    notifyListeners();
  }

  Future<void> register({
    required String username,
    required String email,
    required String password,
  }) async {
    await _api.register(
      username: username,
      email: email,
      password: password,
    );
    await login(email: email, password: password);
  }

  Future<void> logout() async {
    await _webSocket.disconnect();
    await _api.logout();
    _authenticated = false;
    _user = null;
    notifyListeners();
  }

  Future<void> _connectWebSocket() async {
    final token = _api.accessToken;
    if (token == null) return;
    await _webSocket.connect(token);
  }

  @override
  void dispose() {
    _webSocket.dispose();
    super.dispose();
  }
}
