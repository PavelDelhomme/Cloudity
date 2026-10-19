import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:http/http.dart' as http;

/// Auth gateway + profil `/auth/me` (vérif rôle admin).
class AuthApi extends CloudityAuthClient {
  AuthApi(super.gatewayBase);

  Future<Map<String, dynamic>> fetchMe(String accessToken) async {
    final res = await http.get(
      Uri.parse('$baseUrl/auth/me'),
      headers: authHeaders(accessToken, json: false),
    ).timeout(const Duration(seconds: 8));
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AuthException(map['error']?.toString() ?? 'Profil indisponible');
    }
    return map;
  }

  /// Réémet les jetons à partir d’un access encore valide. Le serveur relit le rôle.
  Future<({String access, String refresh})> renewFromAccess(String accessToken) async {
    final res = await http
        .post(
          Uri.parse('$baseUrl/auth/session/renew'),
          headers: authHeaders(accessToken),
        )
        .timeout(const Duration(seconds: 20));
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AuthException(map['error']?.toString() ?? 'Renouvellement (${res.statusCode})');
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse renouvellement invalide.');
    }
    return (access: access, refresh: refresh ?? '');
  }
}
