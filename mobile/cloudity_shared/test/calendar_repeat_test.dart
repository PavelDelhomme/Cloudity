import 'package:cloudity_shared/calendar_repeat.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('prochain rappel quotidien encore dans le futur', () {
    final when = nextCalendarReminderAt(
      start: DateTime(2026, 10, 17, 9),
      minutesBefore: 15,
      repeatRule: 'daily',
      now: DateTime(2026, 10, 17, 9),
    );
    expect(when, DateTime(2026, 10, 18, 8, 45));
  });

  test('récurrence daily se déplie', () {
    final out = expandCalendarEvents(
      [
        {
          'id': 1,
          'title': 'Standup',
          'start_at': DateTime.utc(2026, 10, 6, 8).toIso8601String(),
          'end_at': DateTime.utc(2026, 10, 6, 8, 30).toIso8601String(),
          'repeat_rule': 'daily',
        },
      ],
      rangeStart: DateTime.utc(2026, 10, 6),
      rangeEnd: DateTime.utc(2026, 10, 9),
    );
    expect(out, hasLength(3));
  });

  test('Maps source_key et titre [TEST]', () {
    expect(mapsSourceKey('42'), 'maps:trip:42');
    expect(testTripTitle('Lyon → Paris'), '[TEST] Lyon → Paris');
    expect(testTripTitle('[TEST] déjà'), '[TEST] déjà');
  });

  test('weekly / monthly normalisés', () {
    expect(normalizeCalendarRepeat('WEEKLY'), 'weekly');
    expect(normalizeCalendarRepeat('monthly'), 'monthly');
    expect(normalizeCalendarRepeat('yearly'), isNull);
  });
}
