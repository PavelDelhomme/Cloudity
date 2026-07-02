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

String formatCloudityDateTimeLocal(String? raw) {
  final d = parseCloudityDateTime(raw);
  if (d == null) return '—';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} $h:$m';
}
