import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_drive/main.dart';

void main() {
  testWidgets('démarre avec MaterialApp', (WidgetTester tester) async {
    await tester.pumpWidget(const CloudityDriveApp());
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
