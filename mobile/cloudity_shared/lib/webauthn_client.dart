import 'dart:convert';

import 'package:http/http.dart' as http;

/// Client HTTP passkey discoverable (aligné sur le web `webauthn.ts`).
class CloudityWebAuthnClient {
  CloudityWebAuthnClient(String gatewayBase)
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  Future<Map<String, dynamic>> beginDiscoverableLogin() async {
    final res = await http.post(
      Uri.parse('$_base/auth/webauthn/login/begin-discoverable'),
      headers: {'Content-Type': 'application/json'},
    );
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'login/begin-discoverable: ${res.statusCode}',
      );
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> finishDiscoverableLogin({
    String? tenantId,
    required String challengeB64u,
    required Map<String, dynamic> assertion,
  }) async {
    final payload = <String, dynamic>{
      'challenge': challengeB64u,
      'assertion': assertion,
    };
    if (tenantId != null && tenantId.trim().isNotEmpty) {
      payload['tenant_id'] = tenantId.trim();
    }
    final res = await http.post(
      Uri.parse('$_base/auth/webauthn/login/finish-discoverable'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'login/finish-discoverable: ${res.statusCode} — $body',
      );
    }
    return jsonDecode(body) as Map<String, dynamic>;
  }

  /// Démarre l'enrôlement passkey (JWT utilisateur requis).
  Future<Map<String, dynamic>> beginRegister(String accessToken) async {
    final res = await http.post(
      Uri.parse('$_base/auth/webauthn/register/begin'),
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'register/begin: ${res.statusCode} — $body',
      );
    }
    return jsonDecode(body) as Map<String, dynamic>;
  }

  /// Finalise l'enrôlement passkey.
  Future<Map<String, dynamic>> finishRegister({
    required String accessToken,
    required Map<String, dynamic> attestation,
    String? nickname,
  }) async {
    var url = '$_base/auth/webauthn/register/finish';
    if (nickname != null && nickname.trim().isNotEmpty) {
      url +=
          '?nickname=${Uri.encodeQueryComponent(nickname.trim())}';
    }
    final res = await http.post(
      Uri.parse(url),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(attestation),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    if (res.statusCode != 200) {
      throw CloudityWebAuthnException(
        'register/finish: ${res.statusCode} — $body',
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
