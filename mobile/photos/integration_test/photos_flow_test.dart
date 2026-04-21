import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:cloudity_photos/main.dart' as app;

/// Au build : `--dart-define=…` (injectés par `scripts/test-mobile-photos.sh` si besoin).
/// Détection auto côté script : émulateur → `http://10.0.2.2:6080`, téléphone → IP LAN du PC.
/// Surcharge : `CLOUDITY_E2E_GATEWAY`, `CLOUDITY_E2E_NO_AUTO=1` pour désactiver l’auto.
const String kE2eGateway = String.fromEnvironment('CLOUDITY_E2E_GATEWAY', defaultValue: '');
const String kE2eEmail = String.fromEnvironment('CLOUDITY_E2E_EMAIL', defaultValue: '');
const String kE2ePassword = String.fromEnvironment('CLOUDITY_E2E_PASSWORD', defaultValue: '');
const String kE2eTenant = String.fromEnvironment('CLOUDITY_E2E_TENANT', defaultValue: '1');

const Key kTimeline = ValueKey('cloudity_photos_timeline');
const Key kGateway = ValueKey('cloudity_photos_login_gateway');
const Key kEmail = ValueKey('cloudity_photos_login_email');
const Key kPassword = ValueKey('cloudity_photos_login_password');
const Key kTenant = ValueKey('cloudity_photos_login_tenant');
const Key kSubmit = ValueKey('cloudity_photos_login_submit');

bool _onLogin(WidgetTester tester) =>
    find.text('Connexion — Cloudity Photos').evaluate().isNotEmpty;

bool _onTimeline(WidgetTester tester) => find.byKey(kTimeline).evaluate().isNotEmpty;

Future<void> _pumpUntilLoginOrTimeline(WidgetTester tester, {int maxSteps = 80}) async {
  await tester.pumpWidget(const app.CloudityPhotosApp());
  for (var i = 0; i < maxSteps; i++) {
    await tester.pump(const Duration(milliseconds: 250));
    if (_onLogin(tester) || _onTimeline(tester)) return;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('démarrage : écran connexion ou timeline', (tester) async {
    await _pumpUntilLoginOrTimeline(tester);
    expect(_onLogin(tester) || _onTimeline(tester), isTrue);
  });

  testWidgets(
    'connexion API + affichage timeline (compte démo)',
    (tester) async {
      await _pumpUntilLoginOrTimeline(tester);

      if (_onTimeline(tester)) {
        expect(find.byKey(kTimeline), findsOneWidget);
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
        if (_onTimeline(tester)) break;
      }

      expect(find.byKey(kTimeline), findsOneWidget);
    },
    skip: kE2eGateway.isEmpty || kE2eEmail.isEmpty || kE2ePassword.isEmpty,
  );
}
