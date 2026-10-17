import 'package:flutter/material.dart';

/// Rouge de la ligne d’heure — indicateur fonctionnel, pas un asset Google.
const Color kCalendarNowLine = Color(0xFFE53935);

int? _asCalendarInt(dynamic raw) {
  if (raw is int) return raw;
  return int.tryParse(raw?.toString() ?? '');
}

/// Événement : `calendar_id`. Fiche agenda (`color_hex`) : son propre `id`.
int? calendarIdOf(Map<String, dynamic> item) {
  if (item.containsKey('calendar_id')) return _asCalendarInt(item['calendar_id']);
  if (item.containsKey('color_hex')) return _asCalendarInt(item['id']);
  return null;
}

/// Les tâches Hubera et les événements sans agenda restent visibles.
bool calendarEventVisible(Map<String, dynamic> item, Set<int> hiddenCalendarIds) {
  if (item['_hubera_task'] == true) return true;
  final id = calendarIdOf(item);
  if (id == null) return true;
  return !hiddenCalendarIds.contains(id);
}

List<Map<String, dynamic>> visibleCalendarItems(
  List<Map<String, dynamic>> items,
  Set<int> hiddenCalendarIds,
) {
  return [
    for (final item in items)
      if (calendarEventVisible(item, hiddenCalendarIds)) item,
  ];
}

Color? parseCalendarHex(String? hex) {
  var s = hex?.trim() ?? '';
  if (s.startsWith('#')) s = s.substring(1);
  if (s.length == 6) s = 'FF$s';
  if (s.length != 8) return null;
  final v = int.tryParse(s, radix: 16);
  if (v == null) return null;
  return Color(v);
}

Color colorForCalendarEvent(
  Map<String, dynamic> item,
  List<Map<String, dynamic>> calendars,
  Color fallback,
) {
  if (item['_hubera_task'] == true) return const Color(0xFF188038);
  final id = calendarIdOf(item);
  if (id == null) return fallback;
  for (final cal in calendars) {
    if (calendarIdOf(cal) == id) {
      return parseCalendarHex(cal['color_hex']?.toString()) ?? fallback;
    }
  }
  return fallback;
}
