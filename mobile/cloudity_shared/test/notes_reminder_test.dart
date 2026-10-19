import 'package:cloudity_shared/notes_reminder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime(2026, 10, 19, 23, 12);

  test('un rappel dans une minute est conservé', () {
    final fire = noteReminderFireAt(now.add(const Duration(minutes: 1)), now);
    expect(fire, now.add(const Duration(minutes: 1)));
  });

  test('un rappel déjà passé ne part pas', () {
    expect(
      noteReminderFireAt(now.subtract(const Duration(minutes: 1)), now),
      isNull,
    );
    expect(noteReminderFireAt(null, now), isNull);
  });

  test('archive et corbeille annulent la notification', () {
    final plans = noteReminderPlans(
      now: now,
      trashedIds: {8},
      notes: [
        {
          'id': 3,
          'title': 'Dans une minute',
          'remind_at': now.add(const Duration(minutes: 1)).toIso8601String(),
        },
        {
          'id': 4,
          'title': 'Archivée',
          'archived': true,
          'remind_at': now.add(const Duration(minutes: 1)).toIso8601String(),
        },
        {
          'id': 8,
          'title': 'Corbeille',
          'remind_at': now.add(const Duration(minutes: 1)).toIso8601String(),
        },
      ],
    );
    expect(plans.singleWhere((p) => p.noteId == 3).when, isNotNull);
    expect(plans.singleWhere((p) => p.noteId == 4).when, isNull);
    expect(plans.singleWhere((p) => p.noteId == 8).when, isNull);
    expect(plans.singleWhere((p) => p.noteId == 3).title, 'Dans une minute');
  });

  test('un horodatage PostgreSQL +00 reste un rappel futur', () {
    final now = DateTime.parse('2026-10-19T21:24:00Z').toLocal();
    final plans = noteReminderPlans(
      now: now,
      notes: [
        {
          'id': 9,
          'title': 'Rappel une',
          'remind_at': '2026-10-19 21:25:00+00',
        },
      ],
    );
    expect(plans.single.when, DateTime.parse('2026-10-19T21:25:00Z').toLocal());
  });
}
