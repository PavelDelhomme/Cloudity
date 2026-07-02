import 'dart:io';

import 'package:cloudity_shared/photo_match.dart';
import 'package:photo_manager/photo_manager.dart';

import '../api/drive_api.dart';
import 'gallery_backup_logic.dart';
import 'gallery_permissions.dart';
import 'gallery_sync_prefs.dart';
import 'gallery_backup_notifications.dart';
import '../auth/session_store.dart';

export 'gallery_backup_logic.dart' show GalleryBackupResult;

/// Sauvegarde incrémentale galerie → dossier Drive « Photos ».
Future<GalleryBackupResult> runGalleryBackupJob() async {
  await GallerySyncPrefs.setRunInProgress(true);
  try {
    return await _runGalleryBackupJob();
  } finally {
    await GallerySyncPrefs.setRunInProgress(false);
  }
}

/// Comme [runGalleryBackupJob] avec notification Android persistante.
Future<GalleryBackupResult> runGalleryBackupJobWithNotification() async {
  await notifyGalleryBackupStarted();
  try {
    final result = await runGalleryBackupJob();
    await notifyGalleryBackupFinished(
      uploaded: result.uploaded,
      skipped: result.skippedCount,
      hasMore: result.hasMore,
    );
    return result;
  } catch (e) {
    await showGalleryBackupNotification(
      title: 'Sauvegarde Photos en erreur',
      body: e.toString(),
      ongoing: false,
    );
    rethrow;
  }
}

Future<GalleryBackupResult> _runGalleryBackupJob() async {
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
  var hasMore = false;
  PhotoCloudIndex? cloudIndex;
  try {
    final fps = await PhotoMatchClient(session.api.baseUrl).fetchFingerprints(
      session.access,
    );
    cloudIndex = PhotoCloudIndex.fromFingerprints(fps);
  } catch (_) {
    cloudIndex = null;
  }
  final cursor = await GallerySyncPrefs.scanCursor();
  final albumIds = selectedPaths.map((path) => path.id).toList();
  final scanStart = resolveGalleryScanStart(cursor, albumIds);

  for (
    var albumIndex = scanStart.albumIndex;
    albumIndex < selectedPaths.length;
    albumIndex++
  ) {
    final path = selectedPaths[albumIndex];
    final firstPage = albumIndex == scanStart.albumIndex ? scanStart.page : 0;
    for (var page = firstPage; page < galleryMaxPagesPerAlbum; page++) {
      final assets = await path.getAssetListPaged(
        page: page,
        size: galleryScanPageSize,
      );
      if (assets.isEmpty) break;
      for (final asset in assets) {
        if (reachedGalleryBackupBatchLimit(uploaded)) {
          hasMore = true;
          break;
        }
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
        final fileName = name.contains('.') ? name : '$name.jpg';
        if (cloudIndex != null) {
          final hit = cloudIndex.matchLocal(
            name: fileName,
            size: await file.length(),
          );
          if (hit != null) {
            await GallerySyncPrefs.markAssetUploaded(asset.id);
            skipped++;
            continue;
          }
        }
        try {
          await drive.uploadFile(
            accessToken: session.access,
            parentId: folderId,
            file: file,
            fileName: fileName,
            takenAt: asset.createDateTime,
          );
          await GallerySyncPrefs.markAssetUploaded(asset.id);
          uploaded++;
        } on DriveApiException {
          skipped++;
        }
      }
      if (reachedGalleryBackupBatchLimit(uploaded)) {
        hasMore = true;
        await GallerySyncPrefs.saveScanCursor(albumId: path.id, page: page);
        break;
      }
      if (assets.length < galleryScanPageSize) break;
      if (page == galleryMaxPagesPerAlbum - 1) {
        hasMore = true;
        await GallerySyncPrefs.saveScanCursor(albumId: path.id, page: page + 1);
      }
    }
    if (reachedGalleryBackupBatchLimit(uploaded)) break;
  }

  if (!hasMore) {
    await GallerySyncPrefs.clearScanCursor();
  }
  await GallerySyncPrefs.saveLastRun(uploaded: uploaded, skipped: skipped);
  return GalleryBackupResult(
    uploaded: uploaded,
    skippedCount: skipped,
    hasMore: hasMore,
  );
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
