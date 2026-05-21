import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/auth_2fa.dart';
import 'package:cloudity_shared/http_helpers.dart';

const _httpTimeout = Duration(seconds: 8);
const _uploadTimeout = Duration(minutes: 2);

/// Appels HTTP vers le **api-gateway** (auth + drive…).
class AuthApi {
  AuthApi(String gatewayBase)
    : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  String get baseUrl => _base;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    String tenantId = '1',
  }) async {
    final uri = Uri.parse('$_base/auth/login');
    final res = await http
        .post(
          uri,
          headers: authHeaders(null),
          body: jsonEncode({
            'email': email,
            'password': password,
            'tenant_id': tenantId,
          }),
        )
        .timeout(_httpTimeout);
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion impossible ($res.statusCode): $err');
    }
    if (map['requires_2fa'] == true) {
      // L'app présentera un écran 2FA et appellera `verify2FA(...)`.
      // Le mot de passe n'est pas conservé : la deuxième étape ne le requiert pas.
      throw LoginRequires2FAException(
        email: email,
        tenantId: tenantId,
        userId: map['user_id'] is int ? map['user_id'] as int : null,
      );
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token.');
    }
    return {'access_token': access, 'refresh_token': refresh ?? ''};
  }

  Future<bool> authHealth() async {
    final uri = Uri.parse('$_base/auth/health');
    final res = await http.get(uri).timeout(const Duration(seconds: 3));
    return res.statusCode == 200;
  }

  /// Étape 2 du login quand `LoginRequires2FAException` a été levée. Délègue à
  /// [Auth2FAClient] (mutualisé dans `cloudity_shared`).
  Future<Auth2FAResult> verify2FA({
    required String email,
    required String tenantId,
    required String code,
  }) {
    return Auth2FAClient(
      _base,
    ).verify(email: email, tenantId: tenantId, code: code);
  }

  Future<({String access, String refresh})> refreshTokens(
    String refreshToken,
  ) async {
    final uri = Uri.parse('$_base/auth/refresh');
    final res = await http
        .post(
          uri,
          headers: authHeaders(null),
          body: jsonEncode({'refresh_token': refreshToken}),
        )
        .timeout(_httpTimeout);
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Refresh ($res.statusCode): $err');
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse refresh invalide.');
    }
    return (access: access, refresh: refresh ?? refreshToken);
  }

  Future<({String access, String refresh})> ensureValidTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    final v = await validate(accessToken);
    if (v) return (access: accessToken, refresh: refreshToken);
    if (refreshToken.isEmpty) {
      throw AuthException('Session expirée. Reconnectez-vous.');
    }
    return refreshTokens(refreshToken);
  }

  Future<bool> validate(String accessToken) async {
    final uri = Uri.parse('$_base/auth/validate');
    final res = await http
        .get(uri, headers: authHeaders(accessToken, json: false))
        .timeout(_httpTimeout);
    return res.statusCode == 200;
  }

  /// Liste les nœuds Drive à la racine (`parent_id` absent) ou dans un dossier.
  Future<List<Map<String, dynamic>>> fetchDriveNodes({
    required String accessToken,
    int? parentId,
  }) async {
    final q = parentId == null ? '' : '?parent_id=$parentId';
    final uri = Uri.parse('$_base/drive/nodes$q');
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

  Future<Map<String, dynamic>> createFolder({
    required String accessToken,
    required String name,
    int? parentId,
  }) async {
    final uri = Uri.parse('$_base/drive/nodes');
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
    final uri = Uri.parse('$_base/drive/nodes/upload');
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

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
