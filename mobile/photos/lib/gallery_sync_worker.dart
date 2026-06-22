import 'package:workmanager/workmanager.dart';

import 'gallery_backup.dart';
import 'gallery_backup_logic.dart';
import 'gallery_sync_prefs.dart';

/// Nom de tâche WorkManager (unique).
const String galleryBackupTaskName = 'cloudityGalleryBackup';
const String galleryBackupUniqueName = 'cloudity_gallery_backup_periodic';

@pragma('vm:entry-point')
void gallerySyncCallbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == galleryBackupTaskName ||
        task == Workmanager.iOSBackgroundTask) {
      final result = await runGalleryBackupJobWithNotification();
      if (shouldEnqueueGalleryBackupContinuation(
        result: result,
        backupEnabled: await GallerySyncPrefs.isBackupEnabled(),
      )) {
        await _enqueueContinuation();
      }
    }
    return true;
  });
}

Future<void> _enqueueContinuation() async {
  final wifiOnly = await GallerySyncPrefs.wifiOnly();
  final requireCharging = await GallerySyncPrefs.requireCharging();
  await Workmanager().registerOneOffTask(
    galleryBackupContinueTaskId,
    galleryBackupTaskName,
    initialDelay: const Duration(minutes: 1),
    constraints: Constraints(
      networkType: wifiOnly ? NetworkType.unmetered : NetworkType.connected,
      requiresBatteryNotLow: true,
      requiresCharging: requireCharging,
    ),
    existingWorkPolicy: ExistingWorkPolicy.replace,
  );
}
