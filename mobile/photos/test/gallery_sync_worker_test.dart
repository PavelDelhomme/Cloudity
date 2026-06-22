import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_photos/gallery_backup_logic.dart';

void main() {
  test('identifiants tâches WorkManager distincts', () {
    expect(galleryBackupNowTaskId, isNot(galleryBackupContinueTaskId));
    expect(galleryBackupNowTaskId, 'cloudity_gallery_backup_now');
    expect(galleryBackupContinueTaskId, 'cloudity_gallery_backup_continue');
  });

  test('constantes batch alignées sur la logique de lot', () {
    expect(galleryBackupBatchSize, 12);
    expect(reachedGalleryBackupBatchLimit(galleryBackupBatchSize - 1), false);
    expect(reachedGalleryBackupBatchLimit(galleryBackupBatchSize), true);
  });
}
