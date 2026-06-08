import 'dart:io';

import 'package:workmanager/workmanager.dart';

import 'gallery_sync_prefs.dart';
import 'gallery_sync_worker.dart';

/// Applique l’enregistrement ou l’annulation du job périodique selon les prefs.
Future<void> applyGallerySyncSchedule() async {
  if (!Platform.isAndroid) return;

  final enabled = await GallerySyncPrefs.isBackupEnabled();
  if (!enabled) {
    await Workmanager().cancelByUniqueName(galleryBackupUniqueName);
    return;
  }

  final wifiOnly = await GallerySyncPrefs.wifiOnly();
  final requireCharging = await GallerySyncPrefs.requireCharging();

  await Workmanager().registerPeriodicTask(
    galleryBackupUniqueName,
    galleryBackupTaskName,
    frequency: const Duration(minutes: 15),
    constraints: Constraints(
      networkType: wifiOnly ? NetworkType.unmetered : NetworkType.connected,
      requiresBatteryNotLow: true,
      requiresCharging: requireCharging,
    ),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
  );
}

/// Déclenche une passe immédiate (après activation par l’utilisateur).
Future<void> enqueueGalleryBackupNow() async {
  if (!Platform.isAndroid) return;
  if (!await GallerySyncPrefs.isBackupEnabled()) return;

  final wifiOnly = await GallerySyncPrefs.wifiOnly();
  final requireCharging = await GallerySyncPrefs.requireCharging();

  await Workmanager().registerOneOffTask(
    'cloudity_gallery_backup_now',
    galleryBackupTaskName,
    constraints: Constraints(
      networkType: wifiOnly ? NetworkType.unmetered : NetworkType.connected,
      requiresBatteryNotLow: true,
      requiresCharging: requireCharging,
    ),
    existingWorkPolicy: ExistingWorkPolicy.replace,
  );
}
