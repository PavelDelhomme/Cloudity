import 'dart:convert';

import 'package:http/http.dart' as http;

/// Appels HTTP vers le **api-gateway** (auth + drive…).
class AuthApi {
  AuthApi(String gatewayBase) : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  String get baseUrl => _base;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String tenantId,
  }) async {
    final uri = Uri.parse('$_base/auth/login');
    final res = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'tenant_id': tenantId,
      }),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion impossible ($res.statusCode): $err');
    }
    if (map['requires_2fa'] == true) {
      throw AuthException(
        'Ce compte a la double authentification. Utilisez le web pour vous connecter, '
        'ou désactivez provisoirement le 2FA pour les tests mobiles.',
      );
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token.');
    }
    return {'access_token': access, 'refresh_token': refresh ?? ''};
  }

  Future<({String access, String refresh})> refreshTokens(String refreshToken) async {
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
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return res.statusCode == 200;
  }

  /// Liste les nœuds Drive à la racine (`parent_id` absent) ou dans un dossier.
  Future<List<Map<String, dynamic>>> fetchDriveNodes({
    required String accessToken,
    int? parentId,
  }) async {
    final q = parentId == null ? '' : '?parent_id=$parentId';
    final uri = Uri.parse('$_base/drive/nodes$q');
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
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
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
