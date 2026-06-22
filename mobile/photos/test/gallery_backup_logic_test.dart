import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_photos/gallery_backup_logic.dart';
import 'package:cloudity_photos/gallery_sync_prefs.dart';

void main() {
  test('reprise scan : sans curseur démarre au premier album', () {
    final start = resolveGalleryScanStart(null, ['camera', 'screenshots']);
    expect(start.albumIndex, 0);
    expect(start.page, 0);
  });

  test('reprise scan : curseur valide reprend album et page', () {
    final start = resolveGalleryScanStart(
      const GallerySyncScanCursor(albumId: 'screenshots', page: 2),
      ['camera', 'screenshots', 'whatsapp'],
    );
    expect(start.albumIndex, 1);
    expect(start.page, 2);
  });

  test('reprise scan : curseur inconnu repart du début', () {
    final start = resolveGalleryScanStart(
      const GallerySyncScanCursor(albumId: 'deleted', page: 4),
      ['camera'],
    );
    expect(start.albumIndex, 0);
    expect(start.page, 0);
  });

  test('lot atteint la limite batch', () {
    expect(reachedGalleryBackupBatchLimit(11), false);
    expect(reachedGalleryBackupBatchLimit(12), true);
    expect(reachedGalleryBackupBatchLimit(13), true);
  });

  test('chaînage background : lot incomplet et backup actif', () {
    expect(
      shouldEnqueueGalleryBackupContinuation(
        result: GalleryBackupResult(uploaded: 12, hasMore: true),
        backupEnabled: true,
      ),
      true,
    );
    expect(
      shouldEnqueueGalleryBackupContinuation(
        result: GalleryBackupResult(uploaded: 0, hasMore: false),
        backupEnabled: true,
      ),
      false,
    );
    expect(
      shouldEnqueueGalleryBackupContinuation(
        result: GalleryBackupResult(uploaded: 5, hasMore: true),
        backupEnabled: false,
      ),
      false,
    );
    expect(
      shouldEnqueueGalleryBackupContinuation(
        result: GalleryBackupResult(
          skipped: true,
          reason: 'session_absente',
          hasMore: true,
        ),
        backupEnabled: true,
      ),
      false,
    );
  });
}
