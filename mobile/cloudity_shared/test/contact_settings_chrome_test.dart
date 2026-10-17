import 'package:cloudity_shared/suite_product_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pump(WidgetTester tester, Widget home) {
  return tester.pumpWidget(MaterialApp(home: Scaffold(body: home)));
}

void main() {
  testWidgets('réglages suite inchangés tant que le carnet n’est pas demandé', (tester) async {
    await _pump(
      tester,
      const SuiteSettingsPanel(
        gatewayUrl: 'https://api.example.test',
        appName: 'Agenda',
        webAppPath: '/app/calendar',
      ),
    );
    expect(find.text('Paramètres suite'), findsOneWidget);
    expect(find.textContaining('Ouvrir'), findsOneWidget);
    expect(find.text('Mail, Drive, Agenda, Notes…'), findsOneWidget);
  });

  testWidgets('carnet : plus de site, de suite, ni d’autre app', (tester) async {
    await _pump(
      tester,
      const SuiteSettingsPanel(
        gatewayUrl: 'https://api.example.test',
        appName: 'Contacts',
        webAppPath: '/app/contacts',
        addressBook: true,
        accountEmail: 'ada@example.test',
      ),
    );
    expect(find.text('Paramètres suite'), findsNothing);
    expect(find.text('Mail, Drive, Agenda, Notes…'), findsNothing);
    expect(find.textContaining('Ouvrir'), findsNothing);
    expect(find.text('ada@example.test'), findsOneWidget);
    expect(find.text('Trier par'), findsOneWidget);
    expect(find.text('Prénom'), findsOneWidget);
    expect(find.text('Format du nom'), findsOneWidget);
    expect(find.text('Vérifier les mises à jour'), findsNothing);
    expect(find.textContaining('Mail'), findsNothing);
  });

  testWidgets('carnet : la recherche manuelle ne ramène pas la suite', (tester) async {
    await _pump(
      tester,
      SuiteSettingsPanel(
        gatewayUrl: 'https://api.example.test',
        appName: 'Contacts',
        webAppPath: '/app/contacts',
        addressBook: true,
        accountEmail: 'ada@example.test',
        onCheckUpdate: () async {},
      ),
    );
    expect(find.text('Vérifier les mises à jour'), findsOneWidget);
    expect(find.textContaining('jamais forcée'), findsOneWidget);
    expect(huberaInstalledVersionLabel('0.1.13', '14'), 'Installée 0.1.13 · code 14');
    expect(find.text('Paramètres suite'), findsNothing);
    expect(find.textContaining('Ouvrir'), findsNothing);
    expect(find.text('Mail, Drive, Agenda, Notes…'), findsNothing);
    expect(find.text('Apps Hubera'), findsNothing);
  });

  testWidgets('réglages propres : compte, affichage, mise à jour, sans liens suite', (tester) async {
    await _pump(
      tester,
      SuiteSettingsPanel(
        gatewayUrl: 'https://api.example.test',
        appName: 'Notes',
        webAppPath: '/app/notes',
        ownAppSettings: true,
        accountEmail: 'ada@example.test',
        onCheckUpdate: () async {},
      ),
    );
    expect(find.text('ada@example.test'), findsOneWidget);
    expect(find.text('Compte Notes'), findsOneWidget);
    expect(find.text('Vérifier les mises à jour'), findsOneWidget);
    expect(find.text('Paramètres suite'), findsNothing);
    expect(find.textContaining('Ouvrir'), findsNothing);
    expect(find.text('Mail, Drive, Agenda, Notes…'), findsNothing);
    expect(find.text('Apps Hubera'), findsNothing);
    expect(find.textContaining('Version '), findsNothing);
  });

  testWidgets('Tasks : la version s’affiche, sans liens vers les autres apps', (tester) async {
    await _pump(
      tester,
      SuiteSettingsPanel(
        gatewayUrl: 'https://api.example.test',
        appName: 'Tâches',
        webAppPath: '/app/tasks',
        ownAppSettings: true,
        accountEmail: 'ada@example.test',
        installedVersion: '0.1.9',
        onCheckUpdate: () async {},
      ),
    );
    expect(find.text('Version 0.1.9'), findsOneWidget);
    expect(find.textContaining('Détection automatique'), findsOneWidget);
    expect(find.text('Vérifier les mises à jour'), findsOneWidget);
    expect(find.textContaining('jamais forcée'), findsNWidgets(2));
    expect(find.text('Paramètres suite'), findsNothing);
    expect(find.text('Mail, Drive, Agenda, Notes…'), findsNothing);
    expect(find.text('Apps Hubera'), findsNothing);
  });
}
