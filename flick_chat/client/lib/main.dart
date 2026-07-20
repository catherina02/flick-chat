import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/app_theme.dart';
import 'core/auth_service.dart';
import 'core/chat_service.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final authService = AuthService();
  await authService.bootstrap();

  final chatService = ChatService(
    api: authService.api,
    webSocket: authService.webSocket,
  );
  await chatService.initNotifications();

  if (authService.user != null) {
    chatService.attach(userId: authService.user!.id);
    await chatService.loadConversations();
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authService),
        ChangeNotifierProvider.value(value: chatService),
      ],
      child: const FlickChatApp(),
    ),
  );
}

class FlickChatApp extends StatelessWidget {
  const FlickChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Flick Chat',
      theme: buildAppTheme(),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final chat = context.read<ChatService>();

    if (auth.bootstrapping) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!auth.isAuthenticated) {
      chat.detach();
      return const LoginScreen();
    }

    chat.attach(userId: auth.user!.id);

    return const MainScreen();
  }
}
