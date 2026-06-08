import 'package:workmanager/workmanager.dart';

import 'gallery_backup.dart';

/// Nom de tâche WorkManager (unique).
const String galleryBackupTaskName = 'cloudityGalleryBackup';
const String galleryBackupUniqueName = 'cloudity_gallery_backup_periodic';

@pragma('vm:entry-point')
void gallerySyncCallbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == galleryBackupTaskName || task == Workmanager.iOSBackgroundTask) {
      await runGalleryBackupJob();
    }
    return true;
  });
}
