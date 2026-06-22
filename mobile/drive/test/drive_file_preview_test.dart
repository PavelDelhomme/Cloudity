import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_drive/drive_file_preview.dart';

void main() {
  test('drivePreviewKind détecte les formats prévisualisables', () {
    expect(
      drivePreviewKind(name: 'photo.jpg', mimeType: 'image/jpeg'),
      DrivePreviewKind.image,
    );
    expect(drivePreviewKind(name: 'notes.md'), DrivePreviewKind.text);
    expect(
      drivePreviewKind(name: 'rapport.pdf', mimeType: 'application/pdf'),
      DrivePreviewKind.pdf,
    );
    expect(drivePreviewKind(name: 'tableur.xlsx'), DrivePreviewKind.office);
    expect(drivePreviewKind(name: 'archive.zip'), DrivePreviewKind.archive);
    expect(drivePreviewKind(name: 'binaire.bin'), DrivePreviewKind.other);
  });
}
