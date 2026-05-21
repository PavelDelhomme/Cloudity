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
}
