import 'dart:math' as math;

import 'package:cloudity_shared/contact_address_search.dart';
import 'package:cloudity_shared/contact_card.dart';
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
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
      scroll.position.jumpTo(0);
      await tester.pump();
      expect(find.text('Camille'), findsWidgets);
      expect(find.text('Martin'), findsWidgets);
      expect(find.text('Atelier'), findsOneWidget);
      expect(find.text('Relieuse'), findsOneWidget);
      expect(find.text('0600000001'), findsOneWidget);
      expect(find.text('Mobile'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('0600000001')).dy,
        lessThan(tester.getTopLeft(find.text('Ajouter un numéro')).dy),
      );
      expect(
        tester.getTopLeft(find.text('camille@example.com')).dy,
        lessThan(tester.getTopLeft(find.text('Ajouter un numéro')).dy),
      );
      expect(
        tester.getTopLeft(find.text('camille@example.com')).dy,
        lessThan(tester.getTopLeft(find.text('Ajouter adresse e-mail')).dy),
      );
      expect(find.text('camille@example.com'), findsOneWidget);
      expect(find.text('1 rue des Lilas'), findsOneWidget);
      expect(find.text('Enregistrer'), findsNWidgets(2));
      expect(find.text('Enregistrer le contact'), findsNothing);
      expect(find.textContaining('synchronisé'), findsNothing);
      await tester.drag(find.byType(ListView), const Offset(0, -700));
      await tester.pump();
      expect(find.text('Préfère le matin'), findsWidgets);
      expect(find.text('21 février 1990'), findsWidgets);

      final scheme = Theme.of(tester.element(find.text('Enregistrer').first)).colorScheme;
      expect(_contrast(scheme.onSurface, scheme.surface), greaterThan(4.5));
    }
  });

  testWidgets('création : nom replié, puis prénom, nom et champs ajoutés', (tester) async {
    await _pump(
      tester,
      ContactEditorScreen(api: _api()),
      brightness: Brightness.dark,
    );
    expect(find.text('Nom'), findsOneWidget);
    expect(find.text('Prénom'), findsNothing);
    expect(find.text('Entreprise'), findsOneWidget);
    expect(find.text('Téléphone'), findsOneWidget);
    expect(find.text('Mobile'), findsOneWidget);
    expect(find.text('Ajouter un numéro'), findsOneWidget);
    expect(find.text('Notes'), findsOneWidget);
    expect(find.text('Ajouter des infos'), findsOneWidget);
    expect(find.text('E-mail'), findsOneWidget);
    expect(find.text('Adresse'), findsOneWidget);
    expect(find.text('Autre'), findsOneWidget);

    await tester.tap(find.byKey(const Key('contact_editor_expand_name')));
    await tester.pump();
    expect(find.text('Prénom'), findsOneWidget);
    expect(find.text('Nom'), findsOneWidget);

    await tester.tap(find.text('Autre'));
    await tester.pumpAndSettle();
    expect(find.text('Sélectionner les champs à ajouter'), findsOneWidget);
    expect(find.text('Préfixe'), findsOneWidget);
    expect(find.text('Deuxième prénom'), findsOneWidget);
    expect(find.text('Suffixe'), findsOneWidget);
    expect(find.text('Prononciation phonétique'), findsOneWidget);
  });

  testWidgets('adresse : une proposition remplit rue, code, ville et pays', (tester) async {
    await _pump(
      tester,
      ContactEditorScreen(
        api: _api(),
        searchAddresses: (query) async => const [
          ContactAddressHit(
            label: '12 rue des Lilas, Nantes, France',
            street: '12 rue des Lilas',
            postalCode: '44000',
            city: 'Nantes',
            country: 'France',
          ),
        ],
      ),
      brightness: Brightness.dark,
    );
    await tester.tap(find.text('Adresse'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('contact_editor_street')), 'Lil');
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('12 rue des Lilas, Nantes, France'), findsOneWidget);
    await tester.tap(find.text('12 rue des Lilas, Nantes, France'));
    await tester.pump();
    expect(find.text('44000'), findsOneWidget);
    expect(find.text('Nantes'), findsOneWidget);
    expect(find.text('France'), findsOneWidget);
  });

  test('un nom déjà enregistré se rouvre en prénom et nom', () {
    final parts = readContactName({
      'display_name': 'Camille Martin',
    });
    expect(parts.given, 'Camille');
    expect(parts.family, 'Martin');
    expect(composeContactDisplayName(parts), 'Camille Martin');

    final stored = readContactName({
      'display_name': 'Dr Camille Marie Martin Jr',
      'profile': {
        'name_prefix': 'Dr',
        'given_name': 'Camille',
        'middle_name': 'Marie',
        'family_name': 'Martin',
        'name_suffix': 'Jr',
      },
    });
    expect(stored.prefix, 'Dr');
    expect(stored.middle, 'Marie');
    expect(stored.suffix, 'Jr');
    expect(composeContactDisplayName(stored), 'Dr Camille Marie Martin Jr');
  });

  test('la liste groupe le numéro et le préfère à l’e-mail', () {
    expect(formatContactPhone('0600112233'), '06 00 11 22 33');
    expect(formatContactPhone('+33600445566'), '+33 6 00 44 55 66');
    expect(formatContactPhone('33.6.00.44.55.66'), '+33 6 00 44 55 66');
    final both = contactListSubtitle({
      'display_name': 'Essai Liste',
      'email': 'essai.liste@local.test',
      'phone': '0600445566',
    });
    expect(both, '06 00 44 55 66');
    expect(both!.contains('@'), isFalse);
  });

  test('sans prénom ni nom, la fiche et la liste affichent l’entreprise', () {
    final item = {
      'display_name': 'Atelier Labo',
      'profile': {'organization': 'Atelier Labo'},
    };
    expect(readContactName(item).isEmpty, isTrue);
    expect(contactHeadline(item), 'Atelier Labo');
    expect(ContactCardData.fromItem(item).name, 'Atelier Labo');
  });

  test('Photon remplit une adresse structurée', () {
    final hits = hitsFromPhoton({
      'features': [
        {
          'properties': {
            'name': 'Lilas',
            'housenumber': '12',
            'street': 'rue des Lilas',
            'postcode': '44000',
            'city': 'Nantes',
            'country': 'France',
          },
        },
      ],
    });
    expect(hits, hasLength(1));
    expect(hits.first.street, '12 rue des Lilas');
    expect(hits.first.postalCode, '44000');
    expect(hits.first.city, 'Nantes');
    expect(hits.first.country, 'France');
  });
}
