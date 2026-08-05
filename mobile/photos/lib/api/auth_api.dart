import 'dart:convert';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/cloudity_shared.dart';

export 'package:cloudity_shared/auth/auth_exception.dart';

/// Auth H19 + timeline Photos.
class AuthApi extends CloudityAuthClient {
  AuthApi(super.gatewayBase);

  Future<Map<String, dynamic>> fetchTimelinePage({
    required String accessToken,
    required int limit,
    required int offset,
  }) async {
    final uri = Uri.parse('$baseUrl/photos/timeline?limit=$limit&offset=$offset');
    final res = await http
        .get(
          uri,
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Timeline HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}
