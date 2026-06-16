import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_photos/storage_usage.dart';

void main() {
  test('formatStorageBytes affiche Ko/Mo lisibles', () {
    expect(formatStorageBytes(0), '0 o');
    expect(formatStorageBytes(1536), '1.50 Ko');
    expect(formatStorageBytes(5 * 1024 * 1024), '5.00 Mo');
  });

  test('summaryFromApiResponse parse la réponse serveur', () {
    final summary = summaryFromApiResponse({
      'photos': {'label': 'Photos', 'bytes': 1024, 'file_count': 2},
      'drive': {'label': 'Drive', 'bytes': 2048, 'file_count': 1},
      'note': 'test note',
    });
    expect(summary.photos.bytes, 1024);
    expect(summary.photos.fileCount, 2);
    expect(summary.drive.bytes, 2048);
    expect(summary.mailNote, 'test note');
    expect(summary.photos.partial, false);
  });
}
