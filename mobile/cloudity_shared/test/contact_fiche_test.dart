import 'dart:math' as math;

import 'package:cloudity_shared/contact_editor.dart';
import 'package:cloudity_shared/contact_fiche.dart';
import 'package:cloudity_shared/suite_product_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _item = {
  'id': 3,
  'display_name': 'Camille Martin',
  'email': 'camille@example.com',
  'phone': '0600000001',
  'profile': {
    'organization': 'Atelier',
    'job_title': 'Relieuse',
    'phones': [
      {'label': 'mobile', 'value': '0600000001'},
    ],
    'emails': [
      {'label': 'personal', 'value': 'camille@example.com'},
    ],
    'addresses': [
      {'label': 'home', 'street': '1 rue des Lilas', 'postal_code': '44000', 'city': 'Nantes'},
    ],
    'birthday': '1990-02-21',
    'notes': 'Préfère le matin',
  },
};

SuiteProductApi _api() => SuiteProductApi(
      gatewayBase: 'http://127.0.0.1:9',
      accessToken: 'tok',
    );

double _luminance(Color c) {
  double channel(double v) {
    final s = v > 1 ? v / 255 : v;
    return s <= 0.04045 ? s / 12.92 : math.pow((s + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

double _contrast(Color a, Color b) {
  final l1 = _luminance(a);
  final l2 = _luminance(b);
  final hi = l1 > l2 ? l1 : l2;
  final lo = l1 > l2 ? l2 : l1;
  return (hi + 0.05) / (lo + 0.05);
}

Future<void> _pump(WidgetTester tester, Widget home, {required Brightness brightness}) {
  tester.view.physicalSize = const Size(400, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  return tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0891B2),
          brightness: brightness,
        ),
        useMaterial3: true,
      ),
      home: home,
    ),
  );
}

void main() {
  testWidgets('fiche sombre et claire : nom, moyens, actions', (tester) async {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      await _pump(
        tester,
        ContactFicheScreen(
          item: Map<String, dynamic>.from(_item),
          api: _api(),
          onChanged: () async {},
        ),
        brightness: brightness,
      );
      expect(find.text('Camille Martin'), findsOneWidget);
      expect(find.text('Relieuse · Atelier'), findsOneWidget);
      expect(find.text('0600000001'), findsOneWidget);
      expect(find.text('Mobile'), findsOneWidget);
      expect(find.text('camille@example.com'), findsOneWidget);
      expect(find.text('Personnel'), findsWidgets);
      expect(find.text('Appeler'), findsOneWidget);
      expect(find.text('E-mail'), findsOneWidget);
      expect(find.text('Itinéraire'), findsOneWidget);
      expect(find.text('21 février 1990'), findsOneWidget);
      expect(find.text('Préfère le matin'), findsOneWidget);
      expect(find.textContaining('synchronisé'), findsNothing);

      final scheme = Theme.of(tester.element(find.byKey(const Key('contact_fiche_name')))).colorScheme;
      expect(_contrast(scheme.onSurface, scheme.surface), greaterThan(4.5));
      expect(_contrast(scheme.onPrimaryContainer, scheme.primaryContainer), greaterThan(3));
    }
  });

  testWidgets('création : les mêmes champs que la fiche', (tester) async {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      await _pump(
        tester,
        ContactEditorScreen(api: _api(), existing: Map<String, dynamic>.from(_item)),
        brightness: brightness,
      );
      expect(find.text('Camille Martin'), findsOneWidget);
      expect(find.text('Atelier'), findsOneWidget);
      expect(find.text('Relieuse'), findsOneWidget);
      expect(find.text('0600000001'), findsOneWidget);
      expect(find.text('Mobile'), findsOneWidget);
      expect(find.text('camille@example.com'), findsOneWidget);
      expect(find.text('1 rue des Lilas'), findsOneWidget);
      expect(find.text('Préfère le matin'), findsOneWidget);
      expect(find.text('21 février 1990'), findsOneWidget);
      expect(find.text('Enregistrer'), findsOneWidget);
      expect(find.textContaining('synchronisé'), findsNothing);

      final scheme = Theme.of(tester.element(find.text('Enregistrer'))).colorScheme;
      expect(_contrast(scheme.onSurface, scheme.surface), greaterThan(4.5));
    }
  });
}
