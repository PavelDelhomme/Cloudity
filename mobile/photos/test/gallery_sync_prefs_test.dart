import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cloudity_photos/gallery_sync_prefs.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('prefs sauvegarde galerie : défauts et marquage asset', () async {
    expect(await GallerySyncPrefs.isBackupEnabled(), false);
    expect(await GallerySyncPrefs.wifiOnly(), true);
    expect(await GallerySyncPrefs.selectedAlbumIds(), isEmpty);
    await GallerySyncPrefs.setBackupEnabled(true);
    await GallerySyncPrefs.setSelectedAlbumIds({'camera', 'screenshots'});
    await GallerySyncPrefs.markAssetUploaded('asset-42');
    expect(await GallerySyncPrefs.isBackupEnabled(), true);
    expect(await GallerySyncPrefs.selectedAlbumIds(), {
      'camera',
      'screenshots',
    });
    expect(await GallerySyncPrefs.isAssetUploaded('asset-42'), true);
    expect(await GallerySyncPrefs.isAssetUploaded('other'), false);
  });

  test('prefs sauvegarde galerie : dernier passage', () async {
    expect(await GallerySyncPrefs.lastRun(), isNull);
    await GallerySyncPrefs.saveLastRun(uploaded: 2, skipped: 3);
    final ok = await GallerySyncPrefs.lastRun();
    expect(ok, isNotNull);
    expect(ok!.failed, false);
    expect(ok.uploaded, 2);
    expect(ok.skipped, 3);

    await GallerySyncPrefs.saveLastRun(
      uploaded: 0,
      skipped: 0,
      error: 'permission refusée',
    );
    final failed = await GallerySyncPrefs.lastRun();
    expect(failed, isNotNull);
    expect(failed!.failed, true);
    expect(failed.error, 'permission refusée');
  });
}
