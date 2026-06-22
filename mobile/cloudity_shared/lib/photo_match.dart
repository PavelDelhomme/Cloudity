import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'http_helpers.dart';

class PhotoFingerprint {
  const PhotoFingerprint({
    required this.id,
    required this.name,
    required this.size,
    this.contentHash,
    this.takenAt,
  });

  final int id;
  final String name;
  final int size;
  final String? contentHash;
  final String? takenAt;

  factory PhotoFingerprint.fromJson(Map<String, dynamic> json) {
    final hash = (json['content_hash'] as String?)?.trim();
    return PhotoFingerprint(
      id: (json['id'] as num).toInt(),
      name: (json['name'] as String?) ?? '',
      size: (json['size'] as num?)?.toInt() ?? 0,
      contentHash: hash == null || hash.isEmpty ? null : hash,
      takenAt: json['taken_at'] as String?,
    );
  }
}

class PhotoMatchCandidate {
  const PhotoMatchCandidate({
    required this.name,
    required this.size,
    this.contentHash,
  });

  final String name;
  final int size;
  final String? contentHash;

  Map<String, dynamic> toJson() => {
    'name': name,
    'size': size,
    if (contentHash != null && contentHash!.isNotEmpty)
      'content_hash': contentHash,
  };
}

class PhotoMatchHit {
  const PhotoMatchHit({
    required this.index,
    required this.nodeId,
    required this.matchedBy,
  });

  final int index;
  final int nodeId;
  final String matchedBy;

  factory PhotoMatchHit.fromJson(Map<String, dynamic> json) {
    return PhotoMatchHit(
      index: (json['index'] as num).toInt(),
      nodeId: (json['node_id'] as num).toInt(),
      matchedBy: (json['matched_by'] as String?) ?? 'unknown',
    );
  }
}

class PhotoMatchSummary {
  const PhotoMatchSummary({
    required this.matches,
    required this.cloudOnlyIds,
    required this.indexTotal,
  });

  final List<PhotoMatchHit> matches;
  final List<int> cloudOnlyIds;
  final int indexTotal;

  factory PhotoMatchSummary.fromJson(Map<String, dynamic> json) {
    final rawMatches = json['matches'];
    final matches = rawMatches is List
        ? rawMatches
              .whereType<Map<String, dynamic>>()
              .map(PhotoMatchHit.fromJson)
              .toList()
        : <PhotoMatchHit>[];
    final rawCloud = json['cloud_only_ids'];
    final cloudOnly = rawCloud is List
        ? rawCloud.map((e) => (e as num).toInt()).toList()
        : <int>[];
    return PhotoMatchSummary(
      matches: matches,
      cloudOnlyIds: cloudOnly,
      indexTotal: (json['index_total'] as num?)?.toInt() ?? 0,
    );
  }
}

String normalizePhotoFileName(String name) =>
    name.trim().toLowerCase();

String photoNameSizeKey(String name, int size) =>
    '${normalizePhotoFileName(name)}|$size';

/// Empreinte locale SHA-256 (hex minuscule) pour matching serveur.
Future<String?> sha256HexFile(List<int> bytes) async {
  if (bytes.isEmpty) return null;
  return sha256.convert(bytes).toString();
}

/// Indexe les empreintes cloud pour lookup O(1) côté client.
class PhotoCloudIndex {
  PhotoCloudIndex._({
    required this.byHash,
    required this.byNameSize,
    required this.allIds,
  });

  final Map<String, List<PhotoFingerprint>> byHash;
  final Map<String, List<PhotoFingerprint>> byNameSize;
  final Set<int> allIds;

  factory PhotoCloudIndex.fromFingerprints(List<PhotoFingerprint> items) {
    final byHash = <String, List<PhotoFingerprint>>{};
    final byNameSize = <String, List<PhotoFingerprint>>{};
    final allIds = <int>{};
    for (final item in items) {
      allIds.add(item.id);
      final hash = item.contentHash?.trim().toLowerCase();
      if (hash != null && hash.isNotEmpty) {
        byHash.putIfAbsent(hash, () => []).add(item);
      }
      byNameSize
          .putIfAbsent(photoNameSizeKey(item.name, item.size), () => [])
          .add(item);
    }
    return PhotoCloudIndex._(
      byHash: byHash,
      byNameSize: byNameSize,
      allIds: allIds,
    );
  }

  PhotoFingerprint? matchLocal({
    required String name,
    required int size,
    String? contentHash,
    Set<int> usedIds = const {},
  }) {
    final hash = contentHash?.trim().toLowerCase();
    if (hash != null && hash.isNotEmpty) {
      for (final fp in byHash[hash] ?? const <PhotoFingerprint>[]) {
        if (!usedIds.contains(fp.id)) return fp;
      }
    }
    for (final fp
        in byNameSize[photoNameSizeKey(name, size)] ?? const <PhotoFingerprint>[]) {
      if (!usedIds.contains(fp.id)) return fp;
    }
    return null;
  }
}

class PhotoMatchClient {
  PhotoMatchClient(String gatewayBase)
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  Future<List<PhotoFingerprint>> fetchFingerprints(String accessToken) async {
    final res = await http
        .get(
          Uri.parse('$_base/drive/photos/fingerprints'),
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw PhotoMatchException('fingerprints HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! List) return [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(PhotoFingerprint.fromJson)
        .toList();
  }

  Future<PhotoMatchSummary> matchBatch({
    required String accessToken,
    required List<PhotoMatchCandidate> items,
  }) async {
    final res = await http
        .post(
          Uri.parse('$_base/drive/photos/match'),
          headers: authHeaders(accessToken),
          body: jsonEncode({'items': items.map((e) => e.toJson()).toList()}),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw PhotoMatchException('match HTTP ${res.statusCode}');
    }
    return PhotoMatchSummary.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }
}

class PhotoMatchException implements Exception {
  PhotoMatchException(this.message);
  final String message;
  @override
  String toString() => message;
}
