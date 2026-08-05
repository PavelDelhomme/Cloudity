import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth_2fa.dart';
import '../http_helpers.dart';
import 'auth_exception.dart';

export 'auth_exception.dart';

/// Client auth gateway unique (H19) — login / register / 2FA / refresh / health.
///
/// Les apps étendent cette classe pour les appels métier (Mail, Drive, Photos…).
class CloudityAuthClient {
  CloudityAuthClient(String gatewayBase)
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
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'email': email,
            'password': password,
            'tenant_id': tenantId,
          }),
        )
        .timeout(const Duration(seconds: 8));
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion impossible (${res.statusCode}): $err');
    }
    if (map['requires_2fa'] == true) {
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

  Future<Auth2FAResult> verify2FA({
    required String email,
    required String tenantId,
    required String code,
  }) {
    return Auth2FAClient(_base).verify(
      email: email,
      tenantId: tenantId,
      code: code,
    );
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    String tenantId = '1',
  }) async {
    final uri = Uri.parse('$_base/auth/register');
    final res = await http
        .post(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'email': email,
            'password': password,
            'tenant_id': tenantId,
          }),
        )
        .timeout(const Duration(seconds: 8));
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 201) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Inscription impossible (${res.statusCode}): $err');
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token après inscription.');
    }
    return {'access_token': access, 'refresh_token': refresh ?? ''};
  }

  Future<bool> authHealth() async {
    final uri = Uri.parse('$_base/auth/health');
    final res = await http.get(uri).timeout(const Duration(seconds: 3));
    return res.statusCode == 200;
  }

  Future<({String access, String refresh})> refreshTokens(
    String refreshToken,
  ) async {
    final uri = Uri.parse('$_base/auth/refresh');
    final res = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refresh_token': refreshToken}),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Refresh (${res.statusCode}): $err');
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
    if (accessToken.isEmpty) return false;
    final uri = Uri.parse('$_base/auth/validate');
    try {
      final res = await http.get(
        uri,
        headers: authHeaders(accessToken, json: false),
      ).timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
