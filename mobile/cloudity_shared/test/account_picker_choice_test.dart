import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:cloudity_shared/auth/hubera_account_prompt.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

CloudityAuthAccount _account(String email) {
  return CloudityAuthAccount(
    email: email,
    gatewayUrl: 'https://id.hubera.cloud',
    accessToken: 'access-$email',
    refreshToken: 'refresh-$email',
  );
}

void main() {
  testWidgets('le sélecteur rend le compte tapé', (tester) async {
    final first = _account('premier@hubera.cloud');
    final chosen = _account('choisi@hubera.cloud');
    HuberaAccountChoice? choice;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return TextButton(
              onPressed: () async {
                choice = await promptHuberaAccount(
                  context,
                  [first, chosen],
                  idInstalled: true,
                  deviceEmail: first.email,
                  prominent: true,
                  barrierDismissible: true,
                );
              },
              child: const Text('ouvrir'),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('ouvrir'));
    await tester.pumpAndSettle();
    expect(find.text('Choisir un compte'), findsOneWidget);
    expect(find.text(first.email), findsOneWidget);
    expect(find.text(chosen.email), findsOneWidget);

    await tester.tap(find.text(chosen.email));
    await tester.pumpAndSettle();

    expect(choice, isNotNull);
    expect(choice!.addNew, isFalse);
    expect(choice!.account!.email, chosen.email);
    expect(choice!.account!.refreshToken, 'refresh-${chosen.email}');
  });
}
