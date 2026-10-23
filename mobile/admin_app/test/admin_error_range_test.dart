import 'package:admin_app/features/admin_error_range.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('sans début ni fin, une erreur sans date reste visible', () {
    final shown = filterAdminErrors([
      {'product': 'Sans', 'modified': null},
      {'product': 'Datée', 'modified': '2026-10-02T08:00:00Z'},
    ]);
    expect(shown.map((e) => e['product']), ['Sans', 'Datée']);
  });

  test('un début et une fin gardent le jour inclus et écartent le vide', () {
    final shown = filterAdminErrors(
      [
        {'product': 'Avant', 'modified': '2026-09-01T10:00:00Z'},
        {'product': 'Dans', 'modified': '2026-10-02T10:00:00Z'},
        {'product': 'Après', 'modified': '2026-10-04T10:00:00Z'},
        {'product': 'Sans', 'modified': null},
      ],
      start: DateTime(2026, 10, 1),
      end: DateTime(2026, 10, 3),
    );
    expect(shown.map((e) => e['product']), ['Dans']);
  });

  test('début après fin reste un intervalle', () {
    expect(
      adminErrorInRange(
        when: DateTime(2026, 10, 2),
        start: DateTime(2026, 10, 5),
        end: DateTime(2026, 10, 1),
      ),
      isTrue,
    );
    expect(
      adminErrorInRange(
        when: null,
        start: DateTime(2026, 10, 1),
        end: null,
      ),
      isFalse,
    );
  });

  testWidgets('l’écran montre Début, Fin et seulement l’erreur de l’intervalle', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AdminErrorRangeView(
            crashes: const [
              {'product': 'Dans', 'modified': '2026-10-02T10:00:00Z'},
              {'product': 'Avant', 'modified': '2026-09-01T10:00:00Z'},
              {'product': 'Sans', 'modified': null},
            ],
            start: DateTime(2026, 10, 1),
            end: DateTime(2026, 10, 3),
          ),
        ),
      ),
    );
    expect(find.text('Début'), findsOneWidget);
    expect(find.text('Fin'), findsOneWidget);
    expect(find.text('01/10/2026'), findsOneWidget);
    expect(find.text('03/10/2026'), findsOneWidget);
    expect(find.text('Dans'), findsOneWidget);
    expect(find.text('Avant'), findsNothing);
    expect(find.text('Sans'), findsNothing);
    expect(find.textContaining('@'), findsNothing);
  });
}
