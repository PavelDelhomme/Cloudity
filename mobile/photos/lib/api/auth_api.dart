import 'dart:convert';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/auth_2fa.dart';
import 'package:cloudity_shared/http_helpers.dart';

const _httpTimeout = Duration(seconds: 8);

/// Appels HTTP vers le **api-gateway** (auth + photos + drive…).
class AuthApi {
  AuthApi(String gatewayBase) : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  String get baseUrl => _base;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    String tenantId = '1',
  }) async {
    final uri = Uri.parse('$_base/auth/login');
    final res = await http.post(
      uri,
      headers: authHeaders(null),
      body: jsonEncode({
        'email': email,
        'password': password,
        'tenant_id': tenantId,
      }),
    ).timeout(_httpTimeout);
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion impossible ($res.statusCode): $err');
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

  Future<bool> authHealth() async {
    final uri = Uri.parse('$_base/auth/health');
    final res = await http.get(uri).timeout(const Duration(seconds: 3));
    return res.statusCode == 200;
  }

  /// Étape 2 du login : POST `/auth/2fa/verify` via [Auth2FAClient].
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

  Future<({String access, String refresh})> refreshTokens(String refreshToken) async {
    final uri = Uri.parse('$_base/auth/refresh');
    final res = await http.post(
      uri,
      headers: authHeaders(null),
      body: jsonEncode({'refresh_token': refreshToken}),
    ).timeout(_httpTimeout);
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

  /// Retourne les jetons courants (rafraîchit si l’access n’est plus valide).
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
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
    ).timeout(_httpTimeout);
    return res.statusCode == 200;
  }

  Future<Map<String, dynamic>> fetchTimelinePage({
    required String accessToken,
    required int limit,
    required int offset,
  }) async {
    final uri = Uri.parse('$_base/photos/timeline?limit=$limit&offset=$offset');
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
    ).timeout(_httpTimeout);
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Timeline HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
