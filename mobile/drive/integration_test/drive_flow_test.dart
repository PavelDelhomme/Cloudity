import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:cloudity_drive/main.dart' as app;

/// Définitions injectées par `scripts/test-mobile-app.sh drive` (détection auto gateway, compte démo).
const String kE2eGateway = String.fromEnvironment('CLOUDITY_E2E_GATEWAY', defaultValue: '');
const String kE2eEmail = String.fromEnvironment('CLOUDITY_E2E_EMAIL', defaultValue: '');
const String kE2ePassword = String.fromEnvironment('CLOUDITY_E2E_PASSWORD', defaultValue: '');
const String kE2eTenant = String.fromEnvironment('CLOUDITY_E2E_TENANT', defaultValue: '1');

const Key kFiles = ValueKey('cloudity_drive_files');
const Key kGateway = ValueKey('cloudity_drive_login_gateway');
const Key kEmail = ValueKey('cloudity_drive_login_email');
const Key kPassword = ValueKey('cloudity_drive_login_password');
const Key kTenant = ValueKey('cloudity_drive_login_tenant');
const Key kSubmit = ValueKey('cloudity_drive_login_submit');

bool _onLogin(WidgetTester tester) =>
    find.text('Connexion — Cloudity Drive').evaluate().isNotEmpty;

bool _onFiles(WidgetTester tester) => find.byKey(kFiles).evaluate().isNotEmpty;

Future<void> _pumpUntilLoginOrFiles(WidgetTester tester, {int maxSteps = 80}) async {
  await tester.pumpWidget(const app.CloudityDriveApp());
  for (var i = 0; i < maxSteps; i++) {
    await tester.pump(const Duration(milliseconds: 250));
    if (_onLogin(tester) || _onFiles(tester)) return;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('démarrage : connexion ou liste Drive', (tester) async {
    await _pumpUntilLoginOrFiles(tester);
    expect(_onLogin(tester) || _onFiles(tester), isTrue);
  });

  testWidgets(
    'connexion API + affichage Drive (fichiers)',
    (tester) async {
      await _pumpUntilLoginOrFiles(tester);

      if (_onFiles(tester)) {
        expect(find.byKey(kFiles), findsOneWidget);
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
        if (_onFiles(tester)) break;
      }

      expect(find.byKey(kFiles), findsOneWidget);
    },
    skip: kE2eGateway.isEmpty || kE2eEmail.isEmpty || kE2ePassword.isEmpty,
  );
}
