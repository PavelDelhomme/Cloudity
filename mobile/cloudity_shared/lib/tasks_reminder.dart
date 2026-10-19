import 'cloudity_datetime.dart';

/// Plan d’une notification de tâche. [when] null annule l’alarme.
class TaskReminderPlan {
  const TaskReminderPlan({
    required this.taskId,
    required this.title,
    required this.when,
  });

  final int taskId;
  final String title;
  final DateTime? when;
}

typedef HuberaTaskReminderHook = Future<void> Function(List<TaskReminderPlan> plans);

/// Renseigné par Hubera Tasks. Les autres apps du module ne planifient rien.
HuberaTaskReminderHook? huberaTaskReminderHook;

/// Moment de la notification. Null si le rappel est absent ou déjà passé.
DateTime? taskReminderFireAt(DateTime? remindAt, DateTime now) {
  if (remindAt == null) return null;
  if (!remindAt.isAfter(now)) return null;
  return remindAt;
}

Future<void> dispatchTaskReminders(List<TaskReminderPlan> plans) async {
  final hook = huberaTaskReminderHook;
  if (hook == null) return;
  try {
    await hook(plans);
  } catch (_) {}
}
