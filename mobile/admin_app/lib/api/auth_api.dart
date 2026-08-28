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
}
