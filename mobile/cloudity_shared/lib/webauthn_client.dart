import 'dart:convert';

import 'package:http/http.dart' as http;

/// Client HTTP passkey discoverable (aligné sur le web `webauthn.ts`).
class CloudityWebAuthnClient {
  CloudityWebAuthnClient(String gatewayBase)
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  Future<Map<String, dynamic>> beginDiscoverableLogin({
    String tenantId = '1',
  }) async {
    final res = await http.post(
      Uri.parse('$_base/auth/webauthn/login/begin-discoverable'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'tenant_id': tenantId}),
    );
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'login/begin-discoverable: ${res.statusCode}',
      );
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> finishDiscoverableLogin({
    required String tenantId,
    required String challengeB64u,
    required Map<String, dynamic> assertion,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/auth/webauthn/login/finish-discoverable'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'tenant_id': tenantId,
        'challenge': challengeB64u,
        'assertion': assertion,
      }),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'login/finish-discoverable: ${res.statusCode} — $body',
      );
    }
    return jsonDecode(body) as Map<String, dynamic>;
  }
}

class CloudityWebAuthnException implements Exception {
  CloudityWebAuthnException(this.message);
  final String message;
  @override
  String toString() => message;
}
