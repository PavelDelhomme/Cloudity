#!/usr/bin/env bash
# Copie le socle auth/session depuis mobile/mail vers une nouvelle app suite.
# Usage: ./scripts/mobile/copy-suite-auth-base.sh contacts cloudity_contacts
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="${1:?app folder name under mobile/}"
PKG_NAME="${2:?dart package name}"

TARGET="${ROOT}/mobile/${APP_DIR}"
MAIL="${ROOT}/mobile/mail/lib"
mkdir -p "${TARGET}/lib/auth" "${TARGET}/lib/api"

for f in session_store.dart user_session.dart login_screen.dart; do
  cp "${MAIL}/auth/${f}" "${TARGET}/lib/auth/${f}"
done

# auth_api minimal : auth + refresh seulement pour apps légères
cat > "${TARGET}/lib/api/auth_api.dart" <<'DART'
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:cloudity_shared/auth_2fa.dart';
import 'package:cloudity_shared/http_helpers.dart';

class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class LoginRequires2FAException implements Exception {
  LoginRequires2FAException({
    required this.email,
    required this.tenantId,
    this.userId,
  });
  final String email;
  final String tenantId;
  final int? userId;
}

class AuthApi {
  AuthApi(String gatewayBase)
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;
  String get baseUrl => _base;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    String tenantId = '1',
  }) async {
    final res = await http.post(
      Uri.parse('$_base/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'tenant_id': tenantId,
      }),
    ).timeout(const Duration(seconds: 8));
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AuthException(map['error']?.toString() ?? 'Connexion impossible');
    }
    if (map['requires_2fa'] == true) {
      throw LoginRequires2FAException(email: email, tenantId: tenantId);
    }
    return {
      'access_token': map['access_token'] as String,
      'refresh_token': map['refresh_token']?.toString() ?? '',
    };
  }

  Future<Auth2FAResult> verify2FA({
    required String email,
    required String tenantId,
    required String code,
  }) =>
      Auth2FAClient(_base).verify(email: email, tenantId: tenantId, code: code);

  Future<bool> authHealth() async {
    final res = await http.get(Uri.parse('$_base/auth/health')).timeout(const Duration(seconds: 3));
    return res.statusCode == 200;
  }

  Future<({String access, String refresh})> refreshTokens(String refreshToken) async {
    final res = await http.post(
      Uri.parse('$_base/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refresh_token': refreshToken}),
    );
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AuthException(map['error']?.toString() ?? 'Refresh échoué');
    }
    return (
      access: map['access_token'] as String,
      refresh: map['refresh_token']?.toString() ?? refreshToken,
    );
  }

  Future<({String access, String refresh})> ensureValidTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    if (accessToken.isNotEmpty) {
      try {
        final res = await http.get(
          Uri.parse('$_base/auth/me'),
          headers: authHeaders(accessToken, json: false),
        ).timeout(const Duration(seconds: 5));
        if (res.statusCode == 200) {
          return (access: accessToken, refresh: refreshToken);
        }
      } catch (_) {}
    }
    if (refreshToken.isEmpty) throw AuthException('Session expirée');
    final pair = await refreshTokens(refreshToken);
    return pair;
  }

  Future<Map<String, dynamic>> fetchMe(String accessToken) async {
    final res = await http.get(
      Uri.parse('$_base/auth/me'),
      headers: authHeaders(accessToken, json: false),
    ).timeout(const Duration(seconds: 8));
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AuthException(map['error']?.toString() ?? 'Profil indisponible');
    }
    return map;
  }
}
DART

echo "✅ Socle auth copié vers mobile/${APP_DIR} (lib/auth + lib/api)"
