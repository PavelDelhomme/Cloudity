import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_photos/gallery_album_catalog.dart';

void main() {
  test('décrit les albums photos usuels', () {
    expect(describeGalleryAlbum('Camera').kind, GalleryAlbumKind.camera);
    expect(describeGalleryAlbum('Appareil photo').suggested, true);
    expect(
      describeGalleryAlbum('Screenshots').kind,
      GalleryAlbumKind.screenshots,
    );
    expect(
      describeGalleryAlbum('WhatsApp Images').kind,
      GalleryAlbumKind.messaging,
    );
    expect(describeGalleryAlbum('Telegram').suggested, true);
    expect(describeGalleryAlbum('Download').kind, GalleryAlbumKind.downloads);
    expect(describeGalleryAlbum('Lightroom').kind, GalleryAlbumKind.edited);
  });

  test('garde le nom des albums inconnus', () {
    final presentation = describeGalleryAlbum('Vacances');
    expect(presentation.kind, GalleryAlbumKind.other);
    expect(presentation.label, 'Vacances');
    expect(presentation.suggested, false);
  });
}
