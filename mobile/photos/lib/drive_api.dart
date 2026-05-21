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

  Future<List<Map<String, dynamic>>> fetchNodes(String accessToken, int? parentId) async {
    final path = parentId == null ? '/drive/nodes' : '/drive/nodes?parent_id=$parentId';
    final uri = Uri.parse('$_base$path');
    final res = await http.get(uri, headers: authHeaders(accessToken, json: false)).timeout(_httpTimeout);
    if (res.statusCode != 200) {
      throw DriveApiException('Liste Drive HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! List) return [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> createFolder(
    String accessToken,
    int? parentId,
    String name,
  ) async {
    final uri = Uri.parse('$_base/drive/nodes');
    final res = await http.post(
      uri,
      headers: authHeaders(accessToken),
      body: jsonEncode({
        'name': name,
        'is_folder': true,
        'parent_id': ?parentId,
      }),
    ).timeout(_httpTimeout);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw DriveApiException('Création dossier HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<int> ensurePhotosFolderId(String accessToken) async {
    final roots = await fetchNodes(accessToken, null);
    final existing = roots.where(
      (n) => n['is_folder'] == true && (n['name'] as String? ?? '').trim().toLowerCase() == 'photos',
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
  }) async {
    final uri = Uri.parse('$_base/drive/nodes/upload');
    final req = http.MultipartRequest('POST', uri)
      ..headers.addAll(authHeaders(accessToken, json: false))
      ..fields['name'] = fileName
      ..fields['parent_id'] = '$parentId'
      ..files.add(await http.MultipartFile.fromPath('file', file.path, filename: fileName));
    final streamed = await req.send().timeout(_uploadTimeout);
    final res = await http.Response.fromStream(streamed).timeout(_uploadTimeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      if (res.statusCode == 409) return;
      throw DriveApiException('Upload HTTP ${res.statusCode}: ${res.body}');
    }
  }
}

class DriveApiException implements Exception {
  DriveApiException(this.message);
  final String message;

  @override
  String toString() => message;
}
