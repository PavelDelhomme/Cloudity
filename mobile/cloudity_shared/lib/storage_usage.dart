import 'dart:convert';

import 'package:http/http.dart' as http;

import 'http_helpers.dart';

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

class StorageUsageException implements Exception {
  StorageUsageException(this.message);
  final String message;
  @override
  String toString() => message;
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

/// API `/drive/storage/summary` avec repli client si indisponible.
Future<StorageUsageSummary> fetchStorageUsage({
  required String gatewayBase,
  required String accessToken,
  int maxFiles = 2000,
}) async {
  final base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');
  try {
    final res = await http
        .get(
          Uri.parse('$base/drive/storage/summary'),
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) {
      throw StorageUsageException('Quota stockage HTTP ${res.statusCode}');
    }
    return summaryFromApiResponse(jsonDecode(res.body) as Map<String, dynamic>);
  } on StorageUsageException {
    return _fetchStorageUsageClient(
      gatewayBase: base,
      accessToken: accessToken,
      maxFiles: maxFiles,
    );
  }
}

Future<StorageUsageSummary> _fetchStorageUsageClient({
  required String gatewayBase,
  required String accessToken,
  required int maxFiles,
}) async {
  final roots = await _fetchNodes(gatewayBase, accessToken, null);
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
        gatewayBase: gatewayBase,
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
      gatewayBase: gatewayBase,
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

Future<List<Map<String, dynamic>>> _fetchNodes(
  String gatewayBase,
  String accessToken,
  int? parentId,
) async {
  final path = parentId == null
      ? '/drive/nodes'
      : '/drive/nodes?parent_id=$parentId';
  final res = await http
      .get(
        Uri.parse('$gatewayBase$path'),
        headers: authHeaders(accessToken, json: false),
      )
      .timeout(const Duration(seconds: 8));
  if (res.statusCode != 200) {
    throw StorageUsageException('Liste Drive HTTP ${res.statusCode}');
  }
  final data = jsonDecode(res.body);
  if (data is! List) return [];
  return data.cast<Map<String, dynamic>>();
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
  required String gatewayBase,
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
    final nodes = await _fetchNodes(gatewayBase, accessToken, current);
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
