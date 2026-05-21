import 'dart:io';

import 'package:photo_manager/photo_manager.dart';

import 'drive_api.dart';
import 'gallery_sync_prefs.dart';
import 'session_store.dart';

/// Nombre max de nouvelles photos par passage WorkManager (évite wake lock prolongé).
const _batchSize = 12;

/// Sauvegarde incrémentale galerie → dossier Drive « Photos ».
Future<GalleryBackupResult> runGalleryBackupJob() async {
  if (!Platform.isAndroid) {
    return GalleryBackupResult(skipped: true, reason: 'ios_non_supporté');
  }
  if (!await GallerySyncPrefs.isBackupEnabled()) {
    return GalleryBackupResult(skipped: true, reason: 'désactivé');
  }

  final session = await SessionStore.loadValidatedSession();
  if (session == null) {
    return GalleryBackupResult(skipped: true, reason: 'session_absente');
  }

  final perm = await PhotoManager.requestPermissionExtend();
  if (!perm.isAuth) {
    return GalleryBackupResult(
      skipped: true,
      reason: 'permission_galerie_refusée',
    );
  }

  final drive = DriveApi(session.api.baseUrl);
  int folderId;
  try {
    folderId = await drive.ensurePhotosFolderId(session.access);
  } catch (e) {
    return GalleryBackupResult(skipped: true, reason: 'drive: $e');
  }

  final paths = await PhotoManager.getAssetPathList(
    type: RequestType.image,
    hasAll: true,
  );
  if (paths.isEmpty) {
    return GalleryBackupResult(uploaded: 0, skippedCount: 0);
  }

  final selectedIds = await GallerySyncPrefs.selectedAlbumIds();
  final selectedPaths = selectedIds.isEmpty
      ? <AssetPathEntity>[_allPhotosPath(paths)]
      : paths.where((path) => selectedIds.contains(path.id)).toList();
  if (selectedPaths.isEmpty) {
    return GalleryBackupResult(
      skipped: true,
      reason: 'albums_sélectionnés_introuvables',
    );
  }

  var uploaded = 0;
  var skipped = 0;

  for (final path in selectedPaths) {
    final assets = await path.getAssetListPaged(page: 0, size: 80);
    for (final asset in assets) {
      if (uploaded >= _batchSize) break;
      if (await GallerySyncPrefs.isAssetUploaded(asset.id)) {
        skipped++;
        continue;
      }
      final file = await asset.file;
      if (file == null) {
        skipped++;
        continue;
      }
      final name = asset.title?.trim().isNotEmpty == true
          ? asset.title!.trim()
          : 'photo_${asset.id}.jpg';
      try {
        await drive.uploadFile(
          accessToken: session.access,
          parentId: folderId,
          file: file,
          fileName: name.contains('.') ? name : '$name.jpg',
        );
        await GallerySyncPrefs.markAssetUploaded(asset.id);
        uploaded++;
      } on DriveApiException {
        skipped++;
      }
    }
    if (uploaded >= _batchSize) break;
  }

  return GalleryBackupResult(uploaded: uploaded, skippedCount: skipped);
}

AssetPathEntity _allPhotosPath(List<AssetPathEntity> paths) {
  for (final path in paths) {
    if (path.isAll) return path;
  }
  return paths.first;
}

class GalleryBackupResult {
  GalleryBackupResult({
    this.uploaded = 0,
    this.skippedCount = 0,
    this.skipped = false,
    this.reason,
  });

  final int uploaded;
  final int skippedCount;
  final bool skipped;
  final String? reason;
}
