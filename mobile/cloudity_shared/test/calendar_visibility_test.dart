import 'package:cloudity_shared/calendar_visibility.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('masquer un agenda cache ses événements, pas les tâches', () {
    final items = [
      {'id': 1, 'calendar_id': 7, 'title': 'Point'},
      {'id': 2, 'calendar_id': 8, 'title': 'Anniv'},
      {'id': 3, '_hubera_task': true, 'calendar_id': 7, 'title': 'Tâche'},
      {'id': 4, 'title': 'Sans agenda'},
    ];
    final visible = visibleCalendarItems(items, {7});
    expect(visible.map((e) => e['id']), [2, 3, 4]);
  });

  test('couleur par agenda', () {
    final color = colorForCalendarEvent(
      {'calendar_id': 3},
      [
        {'id': 3, 'color_hex': '#33b679'},
      ],
      const Color(0xFF000000),
    );
    expect(color, const Color(0xFF33B679));
  });
}
