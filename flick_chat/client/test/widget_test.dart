// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flick_chat/main.dart';

void main() {
  testWidgets('Main screen shows chat list and tabs', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();

    expect(find.text('Flick Chat'), findsOneWidget);
    expect(find.text('Chat'), findsWidgets);
    expect(find.text('Contact'), findsOneWidget);
    expect(find.text('Feed'), findsOneWidget);
    expect(find.text('Schedule'), findsOneWidget);
    expect(find.text('Setting'), findsOneWidget);
    expect(find.text('Alya'), findsOneWidget);
    expect(find.text('Bimo'), findsOneWidget);
    expect(find.text('Citra'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('new-chat-button')));
    await tester.pumpAndSettle();
    expect(find.text('Start New Chat'), findsOneWidget);
    expect(find.text('Erin'), findsOneWidget);
    expect(find.text('Farhan'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('close-new-chat')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('chat-0')).first);
    await tester.pumpAndSettle();
    expect(find.text('Hi, do you have time later today?'), findsOneWidget);
    expect(find.text('Yes, I should be free after lunch.'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Contact').last);
    await tester.pumpAndSettle();
    expect(find.text('Erin'), findsOneWidget);
    expect(find.text('Farhan'), findsOneWidget);

    await tester.tap(find.text('Feed').last);
    await tester.pumpAndSettle();
    expect(find.text('Latest updates from your circle'), findsOneWidget);

    await tester.tap(find.text('Schedule').last);
    await tester.pumpAndSettle();
    expect(find.text('Team Standup'), findsOneWidget);

    await tester.tap(find.text('Setting').last);
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
  });
}
