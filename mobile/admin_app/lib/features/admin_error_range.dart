import 'package:flutter/material.dart';

/// Jour local d’une erreur. Null si le rapport n’a pas de date.
DateTime? adminErrorDay(Object? raw) {
  final when = DateTime.tryParse('${raw ?? ''}')?.toLocal();
  if (when == null) return null;
  return DateTime(when.year, when.month, when.day);
}

/// Début et fin inclus. Sans les deux bords, tout reste visible, y compris sans date.
/// Dès qu’un bord est choisi, une erreur sans date sort de la liste.
bool adminErrorInRange({
  required DateTime? when,
  required DateTime? start,
  required DateTime? end,
}) {
  var from = start == null ? null : DateTime(start.year, start.month, start.day);
  var to = end == null ? null : DateTime(end.year, end.month, end.day);
  if (from != null && to != null && from.isAfter(to)) {
    final swap = from;
    from = to;
    to = swap;
  }
  if (from == null && to == null) return true;
  if (when == null) return false;
  final day = DateTime(when.year, when.month, when.day);
  if (from != null && day.isBefore(from)) return false;
  if (to != null && day.isAfter(to)) return false;
  return true;
}

List<Map<String, dynamic>> filterAdminErrors(
  List<Map<String, dynamic>> crashes, {
  DateTime? start,
  DateTime? end,
}) {
  return [
    for (final crash in crashes)
      if (adminErrorInRange(
        when: adminErrorDay(crash['modified']),
        start: start,
        end: end,
      ))
        crash,
  ];
}

String adminErrorStamp(Object? raw) {
  final when = DateTime.tryParse('${raw ?? ''}')?.toLocal();
  if (when == null) return 'Sans date';
  final d = when.day.toString().padLeft(2, '0');
  final m = when.month.toString().padLeft(2, '0');
  final hh = when.hour.toString().padLeft(2, '0');
  final mm = when.minute.toString().padLeft(2, '0');
  return '$d/$m/${when.year} $hh:$mm';
}

String adminErrorDayLabel(DateTime? day) {
  if (day == null) return '';
  final d = day.day.toString().padLeft(2, '0');
  final m = day.month.toString().padLeft(2, '0');
  return '$d/$m/${day.year}';
}

/// Début et fin des erreurs remontées. N’ouvre aucun compte.
class AdminErrorRangeView extends StatelessWidget {
  const AdminErrorRangeView({
    super.key,
    required this.crashes,
    this.start,
    this.end,
    this.onPickStart,
    this.onPickEnd,
    this.onClearStart,
    this.onClearEnd,
  });

  final List<Map<String, dynamic>> crashes;
  final DateTime? start;
  final DateTime? end;
  final VoidCallback? onPickStart;
  final VoidCallback? onPickEnd;
  final VoidCallback? onClearStart;
  final VoidCallback? onClearEnd;

  @override
  Widget build(BuildContext context) {
    final shown = filterAdminErrors(crashes, start: start, end: end);
    final ranged = start != null || end != null;
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _bound(
                context,
                title: 'Début',
                day: start,
                onPick: onPickStart,
                onClear: onClearStart,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _bound(
                context,
                title: 'Fin',
                day: end,
                onPick: onPickEnd,
                onClear: onClearEnd,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (shown.isEmpty)
          Text(
            ranged
                ? 'Aucune erreur dans cet intervalle.'
                : 'Aucune erreur remontée par les applications pour cette date.',
            style: TextStyle(color: scheme.onSurface),
          )
        else
          for (final crash in shown)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                '${crash['product'] ?? crash['id'] ?? crash['filename'] ?? 'rapport'}',
                style: TextStyle(color: scheme.onSurface),
              ),
              subtitle: Text(
                adminErrorStamp(crash['modified']),
                style: TextStyle(color: scheme.onSurface),
              ),
            ),
      ],
    );
  }

  Widget _bound(
    BuildContext context, {
    required String title,
    required DateTime? day,
    required VoidCallback? onPick,
    required VoidCallback? onClear,
  }) {
    final scheme = Theme.of(context).colorScheme;
    final label = adminErrorDayLabel(day);
    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: scheme.onSurface.withValues(alpha: 0.35)),
      ),
      child: InkWell(
        onTap: onPick,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(color: scheme.onSurface, fontSize: 13)),
                    if (label.isNotEmpty)
                      Text(label, style: TextStyle(color: scheme.onSurface, fontSize: 16)),
                  ],
                ),
              ),
              if (day != null)
                IconButton(
                  tooltip: 'Effacer $title',
                  onPressed: onClear,
                  icon: Icon(Icons.close, color: scheme.onSurface),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
