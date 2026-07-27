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
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  if (day == today) return "Aujourd'hui";
  if (day == today.add(const Duration(days: 1))) return 'Demain';
  const weekdays = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  final wd = weekdays[d.weekday - 1];
  return '$wd ${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

String formatCloudityDateTimeLocal(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return '—';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} $h:$m';
}
