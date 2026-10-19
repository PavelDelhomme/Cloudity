import 'cloudity_datetime.dart';

/// Plan d’une notification de note. [when] null annule l’alarme.
class NoteReminderPlan {
  const NoteReminderPlan({
    required this.noteId,
    required this.title,
    required this.when,
  });

  final int noteId;
  final String title;
  final DateTime? when;
}

typedef HuberaNoteReminderHook = Future<void> Function(List<NoteReminderPlan> plans);

/// Renseigné par Hubera Notes. Les autres apps du module ne planifient rien.
HuberaNoteReminderHook? huberaNoteReminderHook;

/// Moment de la notification. Null si le rappel est absent ou déjà passé.
DateTime? noteReminderFireAt(DateTime? remindAt, DateTime now) {
  if (remindAt == null) return null;
  if (!remindAt.isAfter(now)) return null;
  return remindAt;
}

List<NoteReminderPlan> noteReminderPlans({
  required List<Map<String, dynamic>> notes,
  required DateTime now,
  Set<int> trashedIds = const {},
}) {
  final out = <NoteReminderPlan>[];
  for (final item in notes) {
    final rawId = item['id'];
    final noteId = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
    if (noteId == null) continue;
    final titleRaw = (item['title']?.toString() ?? '').trim();
    final archived = item['archived'] == true;
    final when = archived || trashedIds.contains(noteId)
        ? null
        : noteReminderFireAt(
            parseCloudityDateTime(item['remind_at']?.toString()),
            now,
          );
    out.add(
      NoteReminderPlan(
        noteId: noteId,
        title: titleRaw.isEmpty ? 'Note' : titleRaw,
        when: when,
      ),
    );
  }
  return out;
}

Future<void> dispatchNoteReminders(List<NoteReminderPlan> plans) async {
  final hook = huberaNoteReminderHook;
  if (hook == null) return;
  try {
    await hook(plans);
  } catch (_) {}
}
