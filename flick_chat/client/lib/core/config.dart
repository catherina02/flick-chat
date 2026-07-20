import 'dart:io';

class AppConfig {
  static String get apiBaseUrl {
    const override = String.fromEnvironment('API_BASE_URL');
    if (override.isNotEmpty) {
      return override;
    }

    if (Platform.isAndroid) {
      return 'http://10.0.2.2:8000';
    }

    return 'http://127.0.0.1:8000';
  }

  static String get authBaseUrl => '$apiBaseUrl/api/v1/auth';

  static String get chatBaseUrl => '$apiBaseUrl/api/v1/chat';

  static String get wsBaseUrl {
    const override = String.fromEnvironment('WS_BASE_URL');
    if (override.isNotEmpty) {
      return override;
    }

    final httpBase = apiBaseUrl;
    if (httpBase.startsWith('https://')) {
      return httpBase.replaceFirst('https://', 'wss://');
    }
    return httpBase.replaceFirst('http://', 'ws://');
  }

  static Uri wsChatUri(String accessToken) {
    return Uri.parse('$wsBaseUrl/ws/chat/?token=$accessToken');
  }
}
