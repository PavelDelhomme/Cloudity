import 'dart:convert';

import 'package:http/http.dart' as http;

/// Appels HTTP vers le **api-gateway** (auth + mail).
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

  Future<List<Map<String, dynamic>>> fetchMailAccounts(String accessToken) async {
    final uri = Uri.parse('$_base/mail/me/accounts');
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Mail comptes HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! List) {
      throw AuthException('Réponse comptes invalide');
    }
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<({List<Map<String, dynamic>> messages, int total})> fetchMailMessages({
    required String accessToken,
    required int accountId,
    String folder = 'inbox',
    int limit = 30,
    int offset = 0,
  }) async {
    final uri = Uri.parse('$_base/mail/me/accounts/$accountId/messages').replace(
      queryParameters: {
        'folder': folder,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
    );
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Mail messages HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is List) {
      final list = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      return (messages: list, total: list.length);
    }
    if (data is Map<String, dynamic>) {
      final raw = data['messages'];
      final list = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];
      final total = data['total'];
      final n = total is int ? total : (total is num ? total.toInt() : list.length);
      return (messages: list, total: n);
    }
    throw AuthException('Réponse messages invalide');
  }
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
