import 'package:cloudity_shared/hubera_scaffold.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('le menu compte liste l’adresse Hubera ID et les réglages', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            actions: [
              HuberaAccountAvatar(
                onTap: () {},
                email: 'ada@example.test',
                onOpenSettings: () {},
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Compte'));
    await tester.pumpAndSettle();
    expect(find.text('ada@example.test'), findsOneWidget);
    expect(find.text('Compte Hubera ID'), findsOneWidget);
    expect(find.text('Réglages de cette app'), findsOneWidget);
  });
}
