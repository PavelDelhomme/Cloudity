import 'dart:convert';

import 'package:cloudity_shared/http_helpers.dart';
import 'package:http/http.dart' as http;

/// API client pour `cloudity-passwords-service` (via api-gateway).
///
/// **Lecture seule** au sprint 2026-05 : on n'expose que `fetchVaults`,
/// `fetchItems`. L'édition mobile est en L2.
class PassApi {
  PassApi(String gatewayBase) : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  String get baseUrl => _base;

  // --- Auth ----------------------------------------------------------

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String tenantId,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/auth/login'),
      headers: authHeaders(null),
      body: jsonEncode({
        'email': email,
        'password': password,
        'tenant_id': tenantId,
      }),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw PassException('Connexion impossible (${res.statusCode}): ${map['error'] ?? body}');
    }
    if (map['requires_2fa'] == true) {
      throw PassException(
        'Ce compte a la 2FA. Pour la version lecture seule mobile, '
        'connectez-vous une fois sur le web pour valider la session, '
        'puis relancez l\'app.',
      );
    }
    final access = map['access_token'] as String?;
    if (access == null || access.isEmpty) {
      throw PassException('Réponse serveur sans access_token.');
    }
    return {
      'access_token': access,
      'refresh_token': (map['refresh_token'] as String?) ?? '',
      'user_id': (map['user_id'] as String?) ?? '',
    };
  }

  Future<({String access, String refresh})> refreshTokens(String refreshToken) async {
    final res = await http.post(
      Uri.parse('$_base/auth/refresh'),
      headers: authHeaders(null),
      body: jsonEncode({'refresh_token': refreshToken}),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw PassException('Refresh (${res.statusCode}): ${map['error'] ?? body}');
    }
    return (
      access: (map['access_token'] as String?) ?? '',
      refresh: (map['refresh_token'] as String?) ?? refreshToken,
    );
  }

  Future<bool> validate(String accessToken) async {
    final res = await http.get(
      Uri.parse('$_base/auth/validate'),
      headers: authHeaders(accessToken, json: false),
    );
    return res.statusCode == 200;
  }

  Future<({String access, String refresh})> ensureValidTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    if (await validate(accessToken)) {
      return (access: accessToken, refresh: refreshToken);
    }
    if (refreshToken.isEmpty) throw PassException('Session expirée. Reconnectez-vous.');
    return refreshTokens(refreshToken);
  }

  // --- Vaults / items ------------------------------------------------

  Future<List<Map<String, dynamic>>> fetchVaults(String accessToken) async {
    final res = await http.get(
      Uri.parse('$_base/pass/vaults'),
      headers: authHeaders(accessToken, json: false),
    );
    if (res.statusCode == 401) throw PassException('non_autorisé');
    if (res.statusCode != 200) {
      throw PassException('Vaults HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is List) {
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    if (decoded is Map && decoded['vaults'] is List) {
      return (decoded['vaults'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    }
    throw PassException('Réponse vaults invalide');
  }

  Future<List<Map<String, dynamic>>> fetchItems({
    required String accessToken,
    required int vaultId,
  }) async {
    final res = await http.get(
      Uri.parse('$_base/pass/vaults/$vaultId/items'),
      headers: authHeaders(accessToken, json: false),
    );
    if (res.statusCode == 401) throw PassException('non_autorisé');
    if (res.statusCode != 200) {
      throw PassException('Items HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is List) {
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    if (decoded is Map && decoded['items'] is List) {
      return (decoded['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    }
    throw PassException('Réponse items invalide');
  }
}

class PassException implements Exception {
  PassException(this.message);
  final String message;

  @override
  String toString() => message;
}
