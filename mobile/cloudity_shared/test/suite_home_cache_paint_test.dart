import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Le binding de test répond HTTP 400 sans aller sur le réseau.
/// Ce n'est pas une coupure : l'accueil en cache s'affiche sans bandeau.
void _tokens() {
  CloudityDesignTokens.loadSyncForTests(const {
    'brand': {'primary': '#2563EB'},
    'radius': {'sm': 8, 'md': 12, 'lg': 16},
    'spacing': {'xs': 4, 'sm': 8, 'md': 12, 'lg': 16, 'xl': 24},
    'apps': {
      'notes': {'accent': '#CA8A04', 'accentDark': '#A16207'},
      'contacts': {'accent': '#0891B2', 'accentDark': '#0E7490'},
      'calendar': {'accent': '#EA580C', 'accentDark': '#C2410C'},
    },
  });
}

Future<void> _pumpHome(
  WidgetTester tester, {
  required SuiteProduct product,
  required String cacheKey,
  required List<Map<String, dynamic>> items,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({cacheKey: jsonEncode(items)});
  _tokens();
  await tester.pumpWidget(
    MaterialApp(
      home: SuiteProductHomeScreen(
        product: product,
        gatewayBase: 'http://127.0.0.1:9',
        accessToken: 'tok',
        refreshAccessToken: () async => 'tok',
        onLogout: () async {},
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Notes : accueil en cache sans attendre la sync', (tester) async {
    await _pumpHome(
      tester,
      product: SuiteProduct.notes,
      cacheKey: 'hubera_suite_list_notes',
      items: const [
        {'title': 'CacheAccueilNote', 'content': 'déjà là'},
      ],
    );
    expect(find.text('CacheAccueilNote'), findsWidgets);
    expect(
      find.text('Synchronisation interrompue. La liste enregistrée reste affichée.'),
      findsNothing,
    );
  });

  testWidgets('Contacts : accueil en cache sans attendre la sync', (tester) async {
    await _pumpHome(
      tester,
      product: SuiteProduct.contacts,
      cacheKey: 'hubera_suite_list_contacts',
      items: const [
        {'display_name': 'CacheAccueilContact'},
      ],
    );
    expect(find.text('CacheAccueilContact'), findsWidgets);
    expect(find.text('Professionnel'), findsOneWidget);
    expect(
      find.text('Synchronisation interrompue. La liste enregistrée reste affichée.'),
      findsNothing,
    );

    await tester.tap(find.text('Personnel'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('CacheAccueilContact'), findsNothing);
    expect(find.text('Aucun contact personnel'), findsOneWidget);
  });

  testWidgets('Agenda : accueil en cache sans attendre la sync', (tester) async {
    final start = DateTime.now().toUtc().toIso8601String();
    await _pumpHome(
      tester,
      product: SuiteProduct.calendar,
      cacheKey: 'hubera_suite_list_calendar',
      items: [
        {'title': 'CacheAccueilCal', 'start_at': start, 'end_at': start},
      ],
    );
    expect(find.text('CacheAccueilCal'), findsWidgets);
    expect(
      find.text('Synchronisation interrompue. La liste enregistrée reste affichée.'),
      findsNothing,
    );
  });
}
