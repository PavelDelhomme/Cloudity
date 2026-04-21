import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:cloudity_mail/main.dart' as app;

/// Injectés par `scripts/test-mobile-app.sh mail` (gateway auto, compte démo).
const String kE2eGateway = String.fromEnvironment('CLOUDITY_E2E_GATEWAY', defaultValue: '');
const String kE2eEmail = String.fromEnvironment('CLOUDITY_E2E_EMAIL', defaultValue: '');
const String kE2ePassword = String.fromEnvironment('CLOUDITY_E2E_PASSWORD', defaultValue: '');
const String kE2eTenant = String.fromEnvironment('CLOUDITY_E2E_TENANT', defaultValue: '1');

const Key kInbox = ValueKey('cloudity_mail_inbox');
const Key kGateway = ValueKey('cloudity_mail_login_gateway');
const Key kEmail = ValueKey('cloudity_mail_login_email');
const Key kPassword = ValueKey('cloudity_mail_login_password');
const Key kTenant = ValueKey('cloudity_mail_login_tenant');
const Key kSubmit = ValueKey('cloudity_mail_login_submit');

bool _onLogin(WidgetTester tester) =>
    find.text('Connexion — Cloudity Mail').evaluate().isNotEmpty;

bool _onInbox(WidgetTester tester) => find.byKey(kInbox).evaluate().isNotEmpty;

Future<void> _pumpUntilLoginOrInbox(WidgetTester tester, {int maxSteps = 80}) async {
  await tester.pumpWidget(const app.CloudityMailApp());
  for (var i = 0; i < maxSteps; i++) {
    await tester.pump(const Duration(milliseconds: 250));
    if (_onLogin(tester) || _onInbox(tester)) return;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('démarrage : connexion ou boîte de réception', (tester) async {
    await _pumpUntilLoginOrInbox(tester);
    expect(_onLogin(tester) || _onInbox(tester), isTrue);
  });

  testWidgets(
    'connexion API + affichage boîte Mail',
    (tester) async {
      await _pumpUntilLoginOrInbox(tester);

      if (_onInbox(tester)) {
        expect(find.byKey(kInbox), findsOneWidget);
        return;
      }

      expect(find.byKey(kGateway), findsOneWidget);
      await tester.enterText(find.byKey(kGateway), kE2eGateway);
      await tester.enterText(find.byKey(kEmail), kE2eEmail);
      await tester.enterText(find.byKey(kPassword), kE2ePassword);
      await tester.enterText(find.byKey(kTenant), kE2eTenant);
      await tester.pump();

      await tester.tap(find.byKey(kSubmit));
      await tester.pump();

      for (var i = 0; i < 240; i++) {
        await tester.pump(const Duration(milliseconds: 500));
        if (_onInbox(tester)) break;
      }

      expect(find.byKey(kInbox), findsOneWidget);
    },
    skip: kE2eGateway.isEmpty || kE2eEmail.isEmpty || kE2ePassword.isEmpty,
  );
}
