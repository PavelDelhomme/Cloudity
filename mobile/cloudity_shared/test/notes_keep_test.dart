import 'dart:math' as math;

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void _tokens() {
  CloudityDesignTokens.loadSyncForTests(const {
    'brand': {'primary': '#2563EB'},
    'radius': {'sm': 8, 'md': 12, 'lg': 16},
    'spacing': {'xs': 4, 'sm': 8, 'md': 12, 'lg': 16, 'xl': 24},
    'apps': {
      'notes': {'accent': '#CA8A04', 'accentDark': '#A16207'},
    },
  });
}

double _channel(double value) =>
    value <= 0.04045 ? value / 12.92 : math.pow((value + 0.055) / 1.055, 2.4).toDouble();

double _contrast(Color foreground, Color background) {
  double lum(Color color) =>
      0.2126 * _channel(color.r) + 0.7152 * _channel(color.g) + 0.0722 * _channel(color.b);
  final lighter = math.max(lum(foreground), lum(background));
  final darker = math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('corbeille : expiration = date de mise à la corbeille + 60 jours', () {
    final trashed = DateTime.utc(2026, 1, 15, 8, 30);
    final expires = noteTrashExpiresAt(trashed);
    expect(expires.difference(trashed), const Duration(days: 60));
    expect(
      noteTrashIsExpired(
        trashedAt: trashed,
        now: expires.subtract(const Duration(milliseconds: 1)),
      ),
      isFalse,
    );
    expect(noteTrashIsExpired(trashedAt: trashed, now: expires), isTrue);

    final due = noteIdsDueForPermanentDelete(
      trashedAtById: {
        '7': trashed.toIso8601String(),
        '8': expires.toIso8601String(),
      },
      now: expires,
    );
    expect(due, [7]);
    expect(
      noteIdsDueForPermanentDelete(trashedAtById: const {}, now: expires),
      isEmpty,
    );
  });

  testWidgets('drawer Notes : Libellés et Corbeille, pas les autres apps', (tester) async {
    _tokens();
    await tester.pumpWidget(
      MaterialApp(
        home: SuiteDrawerScaffold(
          currentApp: ClouditySuiteApp.notes,
          title: 'Notes',
          gatewayUrl: 'https://api.hubera.cloud',
          showSettings: false,
          showAppSwitcher: false,
          onOpenSettings: () {},
          onCloseSettings: () {},
          onLogout: () async {},
          navItems: buildNotesDrawerTiles(
            section: NotesHomeSection.notes,
            selectedLabel: null,
            labels: const ['Courses'],
            onSection: (_) {},
            onLabel: (_) {},
            onAddLabel: () {},
          ),
          body: const Text('accueil notes'),
        ),
      ),
    );

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    expect(find.text('Libellés'), findsOneWidget);
    expect(find.text('Corbeille'), findsOneWidget);
    expect(find.text('Archive'), findsOneWidget);
    expect(find.text('Courses'), findsOneWidget);
    expect(find.text('Ajouter un libellé'), findsOneWidget);
    expect(find.text('Apps Hubera'), findsNothing);
    expect(find.text('Music'), findsNothing);
    expect(find.text('Maps'), findsNothing);
  });

  for (final brightness in [Brightness.light, Brightness.dark]) {
    testWidgets('composer Keep ($brightness) : titre et contenu sans écran titre seul', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      tester.view.viewPadding = const FakeViewPadding(top: 90, bottom: 72);
      tester.view.padding = const FakeViewPadding(top: 90, bottom: 72);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewPadding);
      addTearDown(tester.view.resetPadding);

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(brightness: brightness, useMaterial3: true),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () => showNotesKeepComposer(context),
                  child: const Text('ouvrir'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();

      expect(find.byKey(notesComposerTitleKey), findsOneWidget);
      expect(find.byKey(notesComposerBodyKey), findsOneWidget);
      await tester.enterText(find.byKey(notesComposerBodyKey), 'liste de courses');
      await tester.pump();
      expect(find.text('liste de courses'), findsOneWidget);
      expect(find.text('Titre'), findsOneWidget);
      final bodyField = tester.widget<TextField>(find.byKey(notesComposerBodyKey));
      expect(bodyField.controller?.text, 'liste de courses');

      final theme = Theme.of(tester.element(find.byKey(notesComposerBodyKey)));
      final foreground = bodyField.style?.color ?? theme.colorScheme.onSurface;
      expect(_contrast(foreground, theme.colorScheme.surface), greaterThan(4.5));

      final logicalHeight = 2400 / 3;
      final bottomInset = 72 / 3;
      final topInset = 90 / 3;
      final save = tester.getRect(find.byKey(notesComposerSaveKey));
      final title = tester.getRect(find.byKey(notesComposerTitleKey));
      expect(save.bottom, lessThanOrEqualTo(logicalHeight - bottomInset + 0.5));
      expect(title.top, greaterThanOrEqualTo(topInset));

      final dismiss = tester.getRect(find.byKey(notesComposerDismissKey));
      expect(dismiss.top, greaterThanOrEqualTo(topInset - 0.5));
      expect(dismiss.height, greaterThan(24));
      await tester.tap(find.byKey(notesComposerDismissKey));
      await tester.pumpAndSettle();
      expect(find.byKey(notesComposerBodyKey), findsNothing);
      expect(find.text('ouvrir'), findsOneWidget);
    });
  }
}
