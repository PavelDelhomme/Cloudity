import 'dart:convert';

import 'package:admin_app/api/auth_api.dart';
import 'package:admin_app/auth/user_session.dart';
import 'package:admin_app/features/admin_account_settings.dart';
import 'package:admin_app/features/admin_home.dart';
import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

String _jwt(Map<String, Object> payload) {
  String part(String raw) => base64Url.encode(utf8.encode(raw)).replaceAll('=', '');
  return '${part('{"alg":"none"}')}.${part(jsonEncode(payload))}.sig';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('le clic compte ouvre les réglages, pas le choix de compte', (tester) async {
    HuberaAccountSwitch.openChooser = false;
    final exp = DateTime.now().toUtc().add(const Duration(days: 2)).millisecondsSinceEpoch ~/ 1000;
    final session = UserSession(
      api: AuthApi('https://id.hubera.cloud'),
      accessToken: _jwt({
        'email': 'admin@example.com',
        'role': 'admin',
        'exp': exp,
      }),
      refreshToken: 'refresh-encore-valide',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: AdminHome(
          session: session,
          onLogout: () async {},
          loadOnStart: false,
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byTooltip('Compte'));
    await tester.pump();

    expect(HuberaAccountSwitch.openChooser, isFalse);
    expect(find.text('Paramètres du compte'), findsOneWidget);
    expect(find.text('Paramètres de l\'application'), findsOneWidget);
    expect(find.text('Hubera Admin'), findsOneWidget);
    expect(find.text('admin@example.com'), findsWidgets);
    expect(find.text('Choisir un compte'), findsNothing);
    expect(find.text('Connexion'), findsNothing);
  });

  testWidgets('les réglages affichent le compte et l\'application', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AdminAccountSettings(
            gatewayUrl: 'https://id.hubera.cloud',
            email: 'admin@example.com',
          ),
        ),
      ),
    );
    expect(find.text('Paramètres du compte'), findsOneWidget);
    expect(find.text('Paramètres de l\'application'), findsOneWidget);
    expect(find.text('Compte déjà connecté'), findsOneWidget);
    expect(find.text('Réglages de cette application'), findsOneWidget);
  });
}
