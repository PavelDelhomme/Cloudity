import 'package:test/test.dart';

import 'package:cloudity_shared/photo_match.dart';

void main() {
  test('photoNameSizeKey normalise le nom', () {
    expect(photoNameSizeKey(' IMG.JPG ', 100), 'img.jpg|100');
  });

  test('PhotoCloudIndex matche par hash puis nom+taille', () {
    final index = PhotoCloudIndex.fromFingerprints([
      const PhotoFingerprint(id: 1, name: 'a.jpg', size: 10, contentHash: 'abc'),
      const PhotoFingerprint(id: 2, name: 'b.jpg', size: 20),
    ]);
    expect(
      index.matchLocal(name: 'x.jpg', size: 0, contentHash: 'abc')?.id,
      1,
    );
    expect(index.matchLocal(name: 'b.jpg', size: 20)?.id, 2);
    expect(index.matchLocal(name: 'missing.jpg', size: 1), isNull);
  });
}
