/// Plan d’une notification locale. Le hook est vide par défaut :
/// les autres apps du module partagé ne planifient rien.
class CalendarReminderPlan {
  const CalendarReminderPlan({
    required this.eventId,
    required this.title,
    required this.when,
    required this.cancel,
  });

  final int eventId;
  final String title;
  final DateTime? when;
  final bool cancel;
}

typedef HuberaCalendarReminderHook = Future<void> Function(CalendarReminderPlan plan);

/// Renseigné uniquement par Hubera Calendar. Défaut : aucun.
HuberaCalendarReminderHook? huberaCalendarReminderHook;

Future<void> dispatchCalendarReminder(CalendarReminderPlan plan) async {
  final hook = huberaCalendarReminderHook;
  if (hook == null) return;
  try {
    await hook(plan);
  } catch (_) {}
}
