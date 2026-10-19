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

  UserSession session() {
    final exp = DateTime.now().toUtc().add(const Duration(days: 2)).millisecondsSinceEpoch ~/ 1000;
    return UserSession(
      api: AuthApi('https://id.hubera.cloud'),
      accessToken: _jwt({
        'email': 'admin@example.com',
        'role': 'admin',
        'exp': exp,
      }),
      refreshToken: 'refresh-encore-valide',
    );
  }

  testWidgets('le clic compte ouvre les réglages, pas le choix de compte', (tester) async {
    HuberaAccountSwitch.openChooser = false;
    var loggedOut = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: AdminHome(
          session: session(),
          onLogout: () async {
            loggedOut++;
          },
          loadOnStart: false,
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byTooltip('Compte'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(loggedOut, 0);
    expect(HuberaAccountSwitch.openChooser, isFalse);
    expect(find.text('Réglages de cette app'), findsOneWidget);
    expect(find.text('Choisir un compte'), findsOneWidget);
    expect(find.text('Ajouter un compte'), findsOneWidget);
    expect(find.text('Hubera ID · confidentialité'), findsOneWidget);
    expect(find.text('Connexion'), findsNothing);

    await tester.tap(find.text('Réglages de cette app'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(loggedOut, 0);
    expect(HuberaAccountSwitch.openChooser, isFalse);
    expect(find.text('Paramètres du compte'), findsOneWidget);
    expect(find.text('Paramètres de l\'application'), findsOneWidget);
    expect(find.text('Hubera Admin'), findsOneWidget);
    expect(find.text('admin@example.com'), findsWidgets);
    expect(find.text('Connexion'), findsNothing);
  });

  testWidgets('le tap sur l’icône ne déconnecte pas, Déconnexion oui', (tester) async {
    HuberaAccountSwitch.openChooser = false;
    var loggedOut = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: AdminHome(
          session: session(),
          onLogout: () async {
            loggedOut++;
          },
          loadOnStart: false,
        ),
      ),
    );
    await tester.pump();

    expect(find.byIcon(Icons.logout), findsNothing);

    await tester.tap(find.byTooltip('Compte'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(loggedOut, 0);
    expect(find.text('Connexion'), findsNothing);

    await tester.tap(find.text('Déconnexion'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(loggedOut, 1);
    expect(HuberaAccountSwitch.openChooser, isFalse);
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
