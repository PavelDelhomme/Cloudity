import 'gallery_sync_prefs.dart';

/// Nombre max de nouvelles photos par passage WorkManager (évite wake lock prolongé).
const int galleryBackupBatchSize = 12;
const int galleryScanPageSize = 80;
const int galleryMaxPagesPerAlbum = 25;

/// Identifiants des tâches one-off WorkManager.
const String galleryBackupNowTaskId = 'cloudity_gallery_backup_now';
const String galleryBackupContinueTaskId = 'cloudity_gallery_backup_continue';

/// Point de reprise du scan albums/pages.
class GalleryAlbumScanStart {
  const GalleryAlbumScanStart({required this.albumIndex, required this.page});

  final int albumIndex;
  final int page;
}

class GalleryBackupResult {
  GalleryBackupResult({
    this.uploaded = 0,
    this.skippedCount = 0,
    this.skipped = false,
    this.reason,
    this.hasMore = false,
  });

  final int uploaded;
  final int skippedCount;
  final bool skipped;
  final String? reason;
  final bool hasMore;
}

/// Reprend le scan à partir du curseur sauvegardé (IDs albums `photo_manager`).
GalleryAlbumScanStart resolveGalleryScanStart(
  GallerySyncScanCursor? cursor,
  List<String> selectedAlbumIds,
) {
  if (cursor == null || selectedAlbumIds.isEmpty) {
    return const GalleryAlbumScanStart(albumIndex: 0, page: 0);
  }
  final idx = selectedAlbumIds.indexOf(cursor.albumId);
  if (idx < 0) {
    return const GalleryAlbumScanStart(albumIndex: 0, page: 0);
  }
  return GalleryAlbumScanStart(albumIndex: idx, page: cursor.page);
}

bool reachedGalleryBackupBatchLimit(int uploaded) =>
    uploaded >= galleryBackupBatchSize;

/// Chaînage one-off si un lot est incomplet et la sauvegarde reste active.
bool shouldEnqueueGalleryBackupContinuation({
  required GalleryBackupResult result,
  required bool backupEnabled,
}) =>
    !result.skipped && result.hasMore && backupEnabled;
