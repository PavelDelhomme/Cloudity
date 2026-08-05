import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/cloudity_shared.dart';

export 'package:cloudity_shared/auth/auth_exception.dart';

const _httpTimeout = Duration(seconds: 8);
const _uploadTimeout = Duration(minutes: 2);

/// Auth H19 + appels Drive métier.
class AuthApi extends CloudityAuthClient {
  AuthApi(super.gatewayBase);

  /// Liste les nœuds Drive à la racine (`parent_id` absent) ou dans un dossier.
  Future<List<Map<String, dynamic>>> fetchDriveNodes({
    required String accessToken,
    int? parentId,
  }) async {
    final q = parentId == null ? '' : '?parent_id=$parentId';
    final uri = Uri.parse('$baseUrl/drive/nodes$q');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Drive HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) {
      throw AuthException('Réponse Drive invalide');
    }
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// Recherche par nom sur tout le Drive (optionnellement sous un dossier).
  Future<List<Map<String, dynamic>>> searchDriveNodes({
    required String accessToken,
    required String query,
    int? parentId,
    int limit = 50,
  }) async {
    final q = query.trim();
    if (q.isEmpty) return [];
    final params = <String, String>{'q': q, 'limit': '$limit'};
    if (parentId != null) {
      params['parent_id'] = '$parentId';
    }
    final uri = Uri.parse(
      '$baseUrl/drive/nodes/search',
    ).replace(queryParameters: params);
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Recherche Drive HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) {
      throw AuthException('Réponse recherche Drive invalide');
    }
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchDriveTrash({
    required String accessToken,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/trash');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Corbeille Drive HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) {
      throw AuthException('Réponse corbeille Drive invalide');
    }
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> deleteDriveNode({
    required String accessToken,
    required int nodeId,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/$nodeId');
    final res = await http
        .delete(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw AuthException('Suppression Drive HTTP ${res.statusCode}');
    }
  }

  Future<void> restoreDriveNode({
    required String accessToken,
    required int nodeId,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/$nodeId/restore');
    final res = await http
        .post(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw AuthException('Restauration Drive HTTP ${res.statusCode}');
    }
  }

  /// Fichiers et dossiers récemment modifiés (tous emplacements).
  Future<List<Map<String, dynamic>>> fetchDriveRecent({
    required String accessToken,
    int limit = 30,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/recent?limit=$limit');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Récents Drive HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) {
      throw AuthException('Réponse récents Drive invalide');
    }
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// Déplace un nœud vers [parentId] (`null` ou `0` = racine).
  Future<void> moveDriveNode({
    required String accessToken,
    required int nodeId,
    int? parentId,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/$nodeId');
    final res = await http
        .put(
          uri,
          headers: authHeaders(accessToken),
          body: jsonEncode({'parent_id': parentId ?? 0}),
        )
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final body = res.body.isEmpty ? '{}' : res.body;
      final decoded = jsonDecode(body);
      final msg = decoded is Map
          ? (decoded['error'] ?? decoded['message'])?.toString()
          : null;
      throw AuthException(msg ?? 'Déplacement Drive HTTP ${res.statusCode}');
    }
  }

  Future<void> purgeDriveNode({
    required String accessToken,
    required int nodeId,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/trash/$nodeId');
    final res = await http
        .delete(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw AuthException('Suppression définitive HTTP ${res.statusCode}');
    }
  }

  Future<Map<String, dynamic>> createFolder({
    required String accessToken,
    required String name,
    int? parentId,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes');
    final payload = <String, dynamic>{'name': name, 'is_folder': true};
    if (parentId != null) {
      payload['parent_id'] = parentId;
    }
    final res = await http
        .post(uri, headers: authHeaders(accessToken), body: jsonEncode(payload))
        .timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    final body = res.body.isEmpty ? '{}' : res.body;
    final decoded = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final msg =
          decoded['message']?.toString() ??
          decoded['error']?.toString() ??
          'Drive HTTP ${res.statusCode}';
      throw AuthException(msg);
    }
    return decoded;
  }

  Future<Map<String, dynamic>> uploadFile({
    required String accessToken,
    required File file,
    required String fileName,
    int? parentId,
    void Function(int sent, int total)? onProgress,
  }) async {
    final uri = Uri.parse('$baseUrl/drive/nodes/upload');
    final length = await file.length();
    var uploadedBytes = 0;
    final stream = http.ByteStream(file.openRead()).transform(
      StreamTransformer<List<int>, List<int>>.fromHandlers(
        handleData: (chunk, sink) {
          sink.add(chunk);
          if (onProgress != null) {
            uploadedBytes += chunk.length;
            onProgress(uploadedBytes, length);
          }
        },
      ),
    );
    final req = http.MultipartRequest('POST', uri)
      ..headers.addAll(authHeaders(accessToken, json: false))
      ..fields['name'] = fileName
      ..fields['mime_type'] = _mimeFromFileName(fileName);
    if (parentId != null) {
      req.fields['parent_id'] = '$parentId';
    }
    req.files.add(
      http.MultipartFile('file', stream, length, filename: fileName),
    );
    final streamed = await req.send().timeout(_uploadTimeout);
    final res = await http.Response.fromStream(
      streamed,
    ).timeout(_uploadTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    final body = res.body.isEmpty ? '{}' : res.body;
    final decoded = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final msg =
          decoded['message']?.toString() ??
          decoded['error']?.toString() ??
          'Upload HTTP ${res.statusCode}';
      throw AuthException(msg);
    }
    return decoded;
  }

  Future<DriveFileDownload> downloadDriveNode({
    required String accessToken,
    required int nodeId,
    bool inline = true,
  }) async {
    final q = inline ? '?inline=1' : '';
    final uri = Uri.parse('$baseUrl/drive/nodes/$nodeId/content$q');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_uploadTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw AuthException('Téléchargement HTTP ${res.statusCode}');
    }
    return DriveFileDownload(
      bytes: res.bodyBytes,
      mimeType: res.headers['content-type']?.split(';').first.trim(),
      disposition: res.headers['content-disposition'],
    );
  }
}

class DriveFileDownload {
  const DriveFileDownload({
    required this.bytes,
    this.mimeType,
    this.disposition,
  });

  final Uint8List bytes;
  final String? mimeType;
  final String? disposition;
}

String _mimeFromFileName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (lower.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}
