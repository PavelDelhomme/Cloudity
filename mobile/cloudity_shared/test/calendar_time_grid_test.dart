import 'package:cloudity_shared/calendar_time_grid.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('semaine commence lundi', () {
    final thu = DateTime(2026, 10, 8, 15);
    final mon = calendarStartOfWeekMonday(thu);
    expect(mon.weekday, DateTime.monday);
    expect(mon.day, 5);
    final days = calendarWeekDays(thu);
    expect(days, hasLength(7));
    expect(days.first.day, 5);
    expect(days.last.day, 11);
  });

  test('segment horaire local', () {
    final day = DateTime(2026, 10, 8);
    final seg = timedSegmentOnDay(
      start: DateTime(2026, 10, 8, 9),
      end: DateTime(2026, 10, 8, 10, 30),
      day: day,
    );
    expect(seg, isNotNull);
    expect(seg!.startMin, 9 * 60);
    expect(seg.endMin, 10 * 60 + 30);
  });

  test('all-day ignoré sur la grille horaire', () {
    expect(
      timedSegmentOnDay(
        start: DateTime(2026, 10, 8),
        end: DateTime(2026, 10, 9),
        day: DateTime(2026, 10, 8),
        allDay: true,
      ),
      isNull,
    );
  });

  test('créneau depuis offset', () {
    final day = DateTime(2026, 10, 8);
    final slot = calendarSlotFromOffset(day, 9 * kCalendarHourPx, 24 * kCalendarHourPx);
    expect(slot.hour, 9);
    expect(slot.minute, 0);
  });
}
