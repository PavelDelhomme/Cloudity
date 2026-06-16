import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/http_helpers.dart';

const _httpTimeout = Duration(seconds: 8);
const _uploadTimeout = Duration(minutes: 2);

/// Appels Drive nécessaires à la sauvegarde galerie (dossier Photos + upload).
class DriveApi {
  DriveApi(String gatewayBase)
    : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  Future<List<Map<String, dynamic>>> fetchNodes(
    String accessToken,
    int? parentId,
  ) async {
    final path = parentId == null
        ? '/drive/nodes'
        : '/drive/nodes?parent_id=$parentId';
    final uri = Uri.parse('$_base$path');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode != 200) {
      throw DriveApiException('Liste Drive HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! List) return [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> fetchTrash(String accessToken) async {
    final uri = Uri.parse('$_base/drive/nodes/trash');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode != 200) {
      throw DriveApiException('Corbeille HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! List) return [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> fetchStorageSummary(String accessToken) async {
    final uri = Uri.parse('$_base/drive/storage/summary');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode != 200) {
      throw DriveApiException('Quota stockage HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> deleteNode(String accessToken, int id) async {
    final uri = Uri.parse('$_base/drive/nodes/$id');
    final res = await http
        .delete(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw DriveApiException('Suppression HTTP ${res.statusCode}');
    }
  }

  Future<void> restoreNode(String accessToken, int id) async {
    final uri = Uri.parse('$_base/drive/nodes/$id/restore');
    final res = await http
        .post(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw DriveApiException('Restauration HTTP ${res.statusCode}');
    }
  }

  Future<Map<String, dynamic>> createFolder(
    String accessToken,
    int? parentId,
    String name,
  ) async {
    final uri = Uri.parse('$_base/drive/nodes');
    final res = await http
        .post(
          uri,
          headers: authHeaders(accessToken),
          body: jsonEncode({
            'name': name,
            'is_folder': true,
            'parent_id': ?parentId,
          }),
        )
        .timeout(_httpTimeout);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw DriveApiException('Création dossier HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<int> ensurePhotosFolderId(String accessToken) async {
    final roots = await fetchNodes(accessToken, null);
    final existing = roots.where(
      (n) =>
          n['is_folder'] == true &&
          (n['name'] as String? ?? '').trim().toLowerCase() == 'photos',
    );
    if (existing.isNotEmpty) {
      return (existing.first['id'] as num).toInt();
    }
    final created = await createFolder(accessToken, null, 'Photos');
    return (created['id'] as num).toInt();
  }

  Future<void> uploadFile({
    required String accessToken,
    required int parentId,
    required File file,
    required String fileName,
    DateTime? takenAt,
  }) async {
    final uri = Uri.parse('$_base/drive/nodes/upload');
    final req = http.MultipartRequest('POST', uri)
      ..headers.addAll(authHeaders(accessToken, json: false))
      ..fields['name'] = fileName
      ..fields['parent_id'] = '$parentId'
      ..fields['mime_type'] = _mimeFromFileName(fileName);
    if (takenAt != null) {
      req.fields['taken_at'] = takenAt.toUtc().toIso8601String();
    }
    req.files.add(
      await http.MultipartFile.fromPath('file', file.path, filename: fileName),
    );
    final streamed = await req.send().timeout(_uploadTimeout);
    final res = await http.Response.fromStream(
      streamed,
    ).timeout(_uploadTimeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      if (res.statusCode == 409) return;
      throw DriveApiException('Upload HTTP ${res.statusCode}: ${res.body}');
    }
  }
}

String _mimeFromFileName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  return 'image/jpeg';
}

class DriveApiException implements Exception {
  DriveApiException(this.message);
  final String message;

  @override
  String toString() => message;
}
