import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _channelId = 'cloudity_gallery_backup';
const _channelName = 'Sauvegarde Photos';
const _notificationId = 4242;

final FlutterLocalNotificationsPlugin _plugin =
    FlutterLocalNotificationsPlugin();

bool _initialized = false;

Future<void> ensureGalleryBackupNotifications() async {
  if (_initialized || !Platform.isAndroid) return;
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _plugin.initialize(
    settings: const InitializationSettings(android: android),
  );
  final androidPlugin = _plugin
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >();
  await androidPlugin?.createNotificationChannel(
    const AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: 'Progression de la sauvegarde galerie vers Cloudity',
      importance: Importance.low,
    ),
  );
  _initialized = true;
}

Future<void> showGalleryBackupNotification({
  required String title,
  required String body,
  bool ongoing = true,
}) async {
  if (!Platform.isAndroid) return;
  await ensureGalleryBackupNotifications();
  await _plugin.show(
    id: _notificationId,
    title: title,
    body: body,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: 'Sauvegarde galerie Cloudity',
        importance: Importance.low,
        priority: Priority.low,
        ongoing: ongoing,
        onlyAlertOnce: true,
      ),
    ),
  );
}

Future<void> clearGalleryBackupNotification() async {
  if (!Platform.isAndroid) return;
  await _plugin.cancel(id: _notificationId);
}

Future<void> notifyGalleryBackupStarted() => showGalleryBackupNotification(
  title: 'Sauvegarde Photos',
  body: 'Envoi des photos vers Cloudity…',
  ongoing: true,
);

Future<void> notifyGalleryBackupFinished({
  required int uploaded,
  required int skipped,
  required bool hasMore,
}) async {
  if (!Platform.isAndroid) return;
  if (hasMore) {
    await showGalleryBackupNotification(
      title: 'Sauvegarde Photos',
      body:
          '$uploaded envoyée(s) · suite planifiée en arrière-plan ($skipped ignorée(s)).',
      ongoing: true,
    );
    return;
  }
  if (uploaded > 0 || skipped > 0) {
    await showGalleryBackupNotification(
      title: 'Sauvegarde Photos terminée',
      body: '$uploaded envoyée(s), $skipped déjà à jour ou ignorée(s).',
      ongoing: false,
    );
    return;
  }
  await clearGalleryBackupNotification();
}
