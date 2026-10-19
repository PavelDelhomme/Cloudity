import 'package:cloudity_shared/tasks_reminder.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

const _channelId = 'hubera_tasks_reminders';
const _channelName = 'Rappels Tasks';
const _prefsKey = 'hubera_tasks_reminder_ids_v1';

final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();

bool _ready = false;

Future<void> _ensure() async {
  if (_ready) return;
  tzdata.initializeTimeZones();
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _plugin.initialize(settings: const InitializationSettings(android: android));
  final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin>();
  await androidPlugin?.createNotificationChannel(
    const AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: 'Rappel d’une tâche Hubera',
      importance: Importance.defaultImportance,
      playSound: false,
      enableVibration: false,
    ),
  );
  await androidPlugin?.requestNotificationsPermission();
  _ready = true;
}

tz.TZDateTime _asUtc(DateTime when) {
  final utc = when.toUtc();
  return tz.TZDateTime.utc(
    utc.year,
    utc.month,
    utc.day,
    utc.hour,
    utc.minute,
    utc.second,
  );
}

/// Pose ou retire les notifications. Pas de son, pas de vibration.
Future<void> scheduleTaskReminders(List<TaskReminderPlan> plans) async {
  await _ensure();
  final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin>();
  final exact = await androidPlugin?.canScheduleExactNotifications() ?? false;
  final mode = exact
      ? AndroidScheduleMode.exactAllowWhileIdle
      : AndroidScheduleMode.inexactAllowWhileIdle;
  final prefs = await SharedPreferences.getInstance();
  final keep = <String>[];
  final details = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: 'Rappel d’une tâche Hubera',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      playSound: false,
      enableVibration: false,
    ),
  );
  for (final plan in plans) {
    final id = plan.taskId;
    final when = plan.when;
    if (when == null) {
      await _plugin.cancel(id: id);
      continue;
    }
    await _plugin.zonedSchedule(
      id: id,
      title: plan.title,
      body: 'Rappel',
      scheduledDate: _asUtc(when),
      notificationDetails: details,
      androidScheduleMode: mode,
    );
    keep.add('$id');
  }
  await prefs.setStringList(_prefsKey, keep);
}
