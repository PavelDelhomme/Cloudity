import 'drive_api.dart';

class ServiceStorageUsage {
  const ServiceStorageUsage({
    required this.label,
    required this.bytes,
    required this.fileCount,
    this.partial = false,
  });

  final String label;
  final int bytes;
  final int fileCount;
  final bool partial;
}

class StorageUsageSummary {
  const StorageUsageSummary({
    required this.photos,
    required this.drive,
    this.mailNote,
  });

  final ServiceStorageUsage photos;
  final ServiceStorageUsage drive;
  final String? mailNote;
}

String formatStorageBytes(int bytes) {
  if (bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final digits = value >= 100 || unit == 0 ? 0 : value >= 10 ? 1 : 2;
  return '${value.toStringAsFixed(digits)} ${units[unit]}';
}

/// Estimation client-side ou via API `/drive/storage/summary`.
Future<StorageUsageSummary> fetchStorageUsage({
  required DriveApi drive,
  required String accessToken,
  int maxFiles = 2000,
}) async {
  try {
    final raw = await drive.fetchStorageSummary(accessToken);
    return summaryFromApiResponse(raw);
  } on DriveApiException {
    return _fetchStorageUsageClient(
      drive: drive,
      accessToken: accessToken,
      maxFiles: maxFiles,
    );
  }
}

StorageUsageSummary summaryFromApiResponse(Map<String, dynamic> raw) {
  ServiceStorageUsage readService(String key, String fallbackLabel) {
    final block = raw[key];
    if (block is! Map) {
      return ServiceStorageUsage(label: fallbackLabel, bytes: 0, fileCount: 0);
    }
    return ServiceStorageUsage(
      label: (block['label'] as String?) ?? fallbackLabel,
      bytes: (block['bytes'] as num?)?.toInt() ?? 0,
      fileCount: (block['file_count'] as num?)?.toInt() ?? 0,
    );
  }

  return StorageUsageSummary(
    photos: readService('photos', 'Photos'),
    drive: readService('drive', 'Drive (hors dossier Photos)'),
    mailNote: raw['note'] as String?,
  );
}

Future<StorageUsageSummary> _fetchStorageUsageClient({
  required DriveApi drive,
  required String accessToken,
  int maxFiles = 2000,
}) async {
  final roots = await drive.fetchNodes(accessToken, null);
  var driveBytes = 0;
  var driveCount = 0;
  var drivePartial = false;
  int? photosFolderId;

  for (final node in roots) {
    if (node['is_folder'] == true) {
      final name = (node['name'] as String? ?? '').trim().toLowerCase();
      if (name == 'photos') {
        photosFolderId = (node['id'] as num?)?.toInt();
        continue;
      }
      final sub = await _sumFolder(
        drive: drive,
        accessToken: accessToken,
        folderId: (node['id'] as num).toInt(),
        remaining: maxFiles - driveCount,
      );
      driveBytes += sub.bytes;
      driveCount += sub.fileCount;
      if (sub.partial) drivePartial = true;
    } else {
      driveBytes += _nodeSize(node);
      driveCount++;
    }
  }

  var photosBytes = 0;
  var photosCount = 0;
  var photosPartial = false;
  if (photosFolderId != null) {
    final photos = await _sumFolder(
      drive: drive,
      accessToken: accessToken,
      folderId: photosFolderId,
      remaining: maxFiles,
    );
    photosBytes = photos.bytes;
    photosCount = photos.fileCount;
    photosPartial = photos.partial;
  }

  return StorageUsageSummary(
    photos: ServiceStorageUsage(
      label: 'Photos',
      bytes: photosBytes,
      fileCount: photosCount,
      partial: photosPartial,
    ),
    drive: ServiceStorageUsage(
      label: 'Drive (hors dossier Photos)',
      bytes: driveBytes,
      fileCount: driveCount,
      partial: drivePartial,
    ),
    mailNote:
        'Le détail Mail sera disponible quand l’API quota multi-service sera exposée.',
  );
}

class _FolderSum {
  const _FolderSum({
    required this.bytes,
    required this.fileCount,
    required this.partial,
  });

  final int bytes;
  final int fileCount;
  final bool partial;
}

Future<_FolderSum> _sumFolder({
  required DriveApi drive,
  required String accessToken,
  required int folderId,
  required int remaining,
}) async {
  if (remaining <= 0) {
    return const _FolderSum(bytes: 0, fileCount: 0, partial: true);
  }
  final queue = <int>[folderId];
  var bytes = 0;
  var count = 0;
  var partial = false;

  while (queue.isNotEmpty && count < remaining) {
    final current = queue.removeAt(0);
    final nodes = await drive.fetchNodes(accessToken, current);
    for (final node in nodes) {
      if (count >= remaining) {
        partial = true;
        break;
      }
      if (node['is_folder'] == true) {
        queue.add((node['id'] as num).toInt());
      } else {
        bytes += _nodeSize(node);
        count++;
      }
    }
  }
  if (queue.isNotEmpty) partial = true;
  return _FolderSum(bytes: bytes, fileCount: count, partial: partial);
}

int _nodeSize(Map<String, dynamic> node) {
  final size = node['size'];
  if (size is num && size > 0) return size.toInt();
  return 0;
}
