import 'cloudity_datetime.dart';

/// Récurrence agenda — même sémantique que `tasks.repeat_rule`.
class CalendarRepeatOption {
  const CalendarRepeatOption(this.value, this.label);
  final String value;
  final String label;
}

const kCalendarRepeatOptions = <CalendarRepeatOption>[
  CalendarRepeatOption('', 'Pas de répétition'),
  CalendarRepeatOption('daily', 'Chaque jour'),
  CalendarRepeatOption('weekdays', 'Jours ouvrés (lun–ven)'),
  CalendarRepeatOption('weekly', 'Chaque semaine'),
  CalendarRepeatOption('monthly', 'Chaque mois'),
];

const kNoteColorOptions = <({String id, String label})>[
  (id: 'default', label: 'Défaut'),
  (id: 'yellow', label: 'Jaune'),
  (id: 'green', label: 'Vert'),
  (id: 'blue', label: 'Bleu'),
  (id: 'pink', label: 'Rose'),
  (id: 'purple', label: 'Violet'),
  (id: 'orange', label: 'Orange'),
  (id: 'teal', label: 'Sarcelle'),
  (id: 'red', label: 'Rouge'),
  (id: 'gray', label: 'Gris'),
];

String? normalizeCalendarRepeat(String? raw) {
  final s = raw?.trim();
  if (s == null || s.isEmpty) return null;
  if (s == 'daily' || s == 'weekdays' || s == 'weekly' || s == 'monthly') {
    return s;
  }
  return null;
}

DateTime _addOccurrence(DateTime start, String rule) {
  switch (rule) {
    case 'daily':
      return start.add(const Duration(days: 1));
    case 'weekdays':
      var n = start.add(const Duration(days: 1));
      while (n.weekday == DateTime.saturday || n.weekday == DateTime.sunday) {
        n = n.add(const Duration(days: 1));
      }
      return n;
    case 'weekly':
      return start.add(const Duration(days: 7));
    case 'monthly':
      return DateTime(
        start.year,
        start.month + 1,
        start.day,
        start.hour,
        start.minute,
        start.second,
        start.millisecond,
      );
    default:
      return start.add(const Duration(days: 1));
  }
}

/// Déplie les événements récurrents dans [rangeStart, rangeEnd).
List<Map<String, dynamic>> expandCalendarEvents(
  List<Map<String, dynamic>> events, {
  required DateTime rangeStart,
  required DateTime rangeEnd,
}) {
  final out = <Map<String, dynamic>>[];
  const maxOcc = 400;

  for (final ev in events) {
    final rule = normalizeCalendarRepeat(ev['repeat_rule']?.toString());
    final startRaw = (ev['start_at'] ?? ev['starts_at'])?.toString();
    final endRaw = (ev['end_at'] ?? ev['ends_at'])?.toString();
    final baseStart = parseCloudityDateTime(startRaw);
    final baseEnd = parseCloudityDateTime(endRaw);
    if (baseStart == null || baseEnd == null) continue;
    final duration = baseEnd.difference(baseStart);
    if (duration.isNegative) continue;

    if (rule == null) {
      if (baseStart.isBefore(rangeEnd) && baseEnd.isAfter(rangeStart)) {
        out.add(Map<String, dynamic>.from(ev));
      }
      continue;
    }

    var cursor = baseStart;
    var guard = 0;
    while (!cursor.add(duration).isAfter(rangeStart) && guard < 2000) {
      cursor = _addOccurrence(cursor, rule);
      guard++;
    }

    var n = 0;
    while (cursor.isBefore(rangeEnd) && n < maxOcc) {
      final occEnd = cursor.add(duration);
      if (cursor.isBefore(rangeEnd) && occEnd.isAfter(rangeStart)) {
        final copy = Map<String, dynamic>.from(ev);
        copy['start_at'] = cursor.toUtc().toIso8601String();
        copy['end_at'] = occEnd.toUtc().toIso8601String();
        copy['occurrence_key'] = '${ev['id']}:${cursor.toUtc().toIso8601String()}';
        out.add(copy);
      }
      cursor = _addOccurrence(cursor, rule);
      n++;
    }
  }

  out.sort((a, b) {
    final sa = parseCloudityDateTime((a['start_at'] ?? '').toString()) ?? DateTime(0);
    final sb = parseCloudityDateTime((b['start_at'] ?? '').toString()) ?? DateTime(0);
    return sa.compareTo(sb);
  });
  return out;
}
