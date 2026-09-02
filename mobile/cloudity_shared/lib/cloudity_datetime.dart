/// Parse une date API Cloudity (RFC3339 ou PostgreSQL sans fuseau = UTC).
DateTime? parseCloudityDateTime(String? raw) {
  final s = raw?.trim();
  if (s == null || s.isEmpty) return null;
  if (RegExp(r'[zZ]$').hasMatch(s) ||
      RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(s) ||
      RegExp(r'[+-]\d{4}$').hasMatch(s)) {
    return DateTime.tryParse(s)?.toLocal();
  }
  final normalized = s.contains('T') ? s : s.replaceFirst(' ', 'T');
  return DateTime.tryParse('${normalized}Z')?.toLocal();
}

String formatCloudityTimeLocal(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return '—';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

/// En-tête de jour pour listes agenda (Aujourd'hui, Demain, ou date complète).
String formatCloudityDayHeader(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return 'Sans date';
  return formatCloudityDayHeaderFromDate(d);
}

String formatCloudityDayHeaderFromDate(DateTime d) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  if (day == today) return "Aujourd'hui";
  if (day == today.add(const Duration(days: 1))) return 'Demain';
  if (day == today.subtract(const Duration(days: 1))) return 'Hier';
  const weekdays = [
    'Lundi',
    'Mardi',
    'Mercredi',
    'Jeudi',
    'Vendredi',
    'Samedi',
    'Dimanche',
  ];
  const months = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];
  final wd = weekdays[d.weekday - 1];
  return '$wd ${d.day} ${months[d.month - 1]}';
}

bool cloudityIsAllDay(String? startRaw, String? endRaw) {
  final start = parseCloudityDateTime(startRaw);
  final end = parseCloudityDateTime(endRaw);
  if (start == null) return false;
  if (start.hour == 0 &&
      start.minute == 0 &&
      (end == null ||
          (end.hour == 0 && end.minute == 0) ||
          end.difference(start).inHours >= 23)) {
    return true;
  }
  return false;
}

bool cloudityIsPastDay(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return false;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  return day.isBefore(today);
}

String formatCloudityDateTimeLocal(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return '—';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} $h:$m';
}
