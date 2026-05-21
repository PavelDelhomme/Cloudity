import 'dart:io';

import 'package:photo_manager/photo_manager.dart';

import 'drive_api.dart';
import 'gallery_permissions.dart';
import 'gallery_sync_prefs.dart';
import 'session_store.dart';

/// Nombre max de nouvelles photos par passage WorkManager (évite wake lock prolongé).
const _batchSize = 12;
const _scanPageSize = 80;
const _maxPagesPerAlbum = 25;

/// Sauvegarde incrémentale galerie → dossier Drive « Photos ».
Future<GalleryBackupResult> runGalleryBackupJob() async {
  if (!Platform.isAndroid) {
    return _skipped('ios_non_supporté');
  }
  if (!await GallerySyncPrefs.isBackupEnabled()) {
    return _skipped('désactivé');
  }

  final session = await SessionStore.loadValidatedSession();
  if (session == null) {
    return _skipped('session_absente');
  }

  final perm = await requestGalleryPermission();
  if (!hasGalleryAccess(perm)) {
    return _skipped(galleryPermissionMessage(perm));
  }

  final drive = DriveApi(session.api.baseUrl);
  int folderId;
  try {
    folderId = await drive.ensurePhotosFolderId(session.access);
  } catch (e) {
    return _skipped('drive: $e');
  }

  final paths = await PhotoManager.getAssetPathList(
    type: RequestType.image,
    hasAll: true,
  );
  if (paths.isEmpty) {
    await GallerySyncPrefs.saveLastRun(uploaded: 0, skipped: 0);
    return GalleryBackupResult(uploaded: 0, skippedCount: 0);
  }

  final selectedIds = await GallerySyncPrefs.selectedAlbumIds();
  final selectedPaths = selectedIds.isEmpty
      ? <AssetPathEntity>[_allPhotosPath(paths)]
      : paths.where((path) => selectedIds.contains(path.id)).toList();
  if (selectedPaths.isEmpty) {
    return _skipped('albums_sélectionnés_introuvables');
  }

  var uploaded = 0;
  var skipped = 0;

  for (final path in selectedPaths) {
    for (var page = 0; page < _maxPagesPerAlbum; page++) {
      final assets = await path.getAssetListPaged(
        page: page,
        size: _scanPageSize,
      );
      if (assets.isEmpty) break;
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
            takenAt: asset.createDateTime,
          );
          await GallerySyncPrefs.markAssetUploaded(asset.id);
          uploaded++;
        } on DriveApiException {
          skipped++;
        }
      }
      if (uploaded >= _batchSize || assets.length < _scanPageSize) break;
    }
    if (uploaded >= _batchSize) break;
  }

  await GallerySyncPrefs.saveLastRun(uploaded: uploaded, skipped: skipped);
  return GalleryBackupResult(uploaded: uploaded, skippedCount: skipped);
}

Future<GalleryBackupResult> _skipped(String reason) async {
  await GallerySyncPrefs.saveLastRun(uploaded: 0, skipped: 0, error: reason);
  return GalleryBackupResult(skipped: true, reason: reason);
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
