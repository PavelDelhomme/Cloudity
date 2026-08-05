import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'package:cloudity_mail/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await cloudityLoadDesignTokens();
  });

  testWidgets('démarre avec MaterialApp', (WidgetTester tester) async {
    await tester.pumpWidget(const CloudityMailApp());
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
