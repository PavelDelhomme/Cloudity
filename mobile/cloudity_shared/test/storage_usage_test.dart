import 'package:test/test.dart';

import 'package:cloudity_shared/storage_usage.dart';

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
    expect(summary.effectiveUsedBytes, 1024 + 2048);
    expect(summary.effectiveQuotaBytes, kDefaultDriveQuotaBytes);
  });

  test('summaryFromApiResponse lit quota_bytes / used_bytes', () {
    final summary = summaryFromApiResponse({
      'photos': {'bytes': 100, 'file_count': 1},
      'drive': {'bytes': 200, 'file_count': 1},
      'used_bytes': 500,
      'quota_bytes': 1024 * 1024 * 1024,
    });
    expect(summary.effectiveUsedBytes, 500);
    expect(summary.effectiveQuotaBytes, 1024 * 1024 * 1024);
  });
}
