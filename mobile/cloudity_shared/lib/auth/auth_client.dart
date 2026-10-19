import 'dart:convert';

import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';

import '../auth_2fa.dart';
import '../http_helpers.dart';
import '../hubera_http.dart';
import '../jwt_claims.dart';
import 'auth_exception.dart';
import 'hubera_id_renew.dart';

export 'auth_exception.dart';

/// Client auth gateway unique (H19) — login / register / 2FA / refresh / health.
///
/// Les apps étendent cette classe pour les appels métier (Mail, Drive, Photos…).
class CloudityAuthClient {
  CloudityAuthClient(String gatewayBase)
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;

  String get baseUrl => _base;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    String? tenantId,
  }) async {
    final uri = Uri.parse('$_base/auth/login');
    final payload = <String, dynamic>{
      'email': email,
      'password': password,
    };
    if (tenantId != null && tenantId.trim().isNotEmpty) {
      payload['tenant_id'] = tenantId.trim();
    }
    final res = await huberaHttp.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
      timeout: const Duration(seconds: 20),
      idempotent: true,
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion impossible (${res.statusCode}): $err');
    }
    if (map['requires_2fa'] == true) {
      throw LoginRequires2FAException(
        email: email,
        tenantId: map['tenant_id']?.toString() ?? tenantId ?? '1',
        userId: map['user_id'] is int ? map['user_id'] as int : null,
      );
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token.');
    }
    final out = <String, dynamic>{
      'access_token': access,
      'refresh_token': refresh ?? '',
    };
    final uid = map['user_id'];
    if (uid != null) out['user_id'] = uid.toString();
    if (map['tenant_id'] != null) out['tenant_id'] = map['tenant_id'].toString();
    return out;
  }

  Future<Auth2FAResult> verify2FA({
    required String email,
    String? tenantId,
    required String code,
  }) {
    return Auth2FAClient(_base).verify(
      email: email,
      tenantId: tenantId,
      code: code,
    );
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    String? tenantId,
  }) async {
    final uri = Uri.parse('$_base/auth/register');
    final payload = <String, dynamic>{
      'email': email,
      'password': password,
    };
    if (tenantId != null && tenantId.trim().isNotEmpty) {
      payload['tenant_id'] = tenantId.trim();
    }
    final res = await huberaHttp.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
      timeout: const Duration(seconds: 20),
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 201) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Inscription impossible (${res.statusCode}): $err');
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token après inscription.');
    }
    return {'access_token': access, 'refresh_token': refresh ?? ''};
  }

  Future<bool> authHealth() async {
    final uri = Uri.parse('$_base/auth/health');
    final res = await huberaHttp.get(uri, timeout: const Duration(seconds: 8));
    return res.statusCode == 200;
  }

  /// Personas de connexion rapide (null si désactivé / 404).
  Future<List<Map<String, dynamic>>?> fetchDevQuickLoginPersonas() async {
    final uri = Uri.parse('$_base/auth/dev/personas');
    try {
      final res = await huberaHttp.get(uri, timeout: const Duration(seconds: 8));
      if (res.statusCode == 404) return null;
      if (res.statusCode != 200) return null;
      final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
      if (map['enabled'] != true) return null;
      final raw = map['personas'];
      if (raw is! List) return null;
      return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return null;
    }
  }

  /// Connexion sans mot de passe — DEV local uniquement.
  Future<Map<String, dynamic>> devQuickLogin({
    required String persona,
    String tenantId = '1',
  }) async {
    final uri = Uri.parse('$_base/auth/dev/quick-login');
    final res = await huberaHttp.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'persona': persona,
        'tenant_id': tenantId,
      }),
      timeout: const Duration(seconds: 20),
      idempotent: true,
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Connexion rapide (${res.statusCode}): $err');
    }
    final access = map['access_token'] as String?;
    if (access == null || access.isEmpty) {
      throw AuthException('Réponse serveur sans access_token.');
    }
    return map;
  }

  Future<({String access, String refresh})> refreshTokens(
    String refreshToken,
  ) async {
    final uri = Uri.parse('$_base/auth/refresh');
    final res = await huberaHttp.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refresh_token': refreshToken}),
      timeout: const Duration(seconds: 20),
      idempotent: true,
    );
    final body = res.body.isEmpty ? '{}' : res.body;
    final map = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? body;
      throw AuthException('Refresh (${res.statusCode}): $err');
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
    String? accountEmail,
  }) async {
    // Renouvellement silencieux avant expiration (comme Google) — évite les 401
    // dès qu’une app revient au premier plan après quelques heures.
    final stillValid =
        accessToken.isNotEmpty && !isAccessTokenExpiringSoon(accessToken);
    final email = (emailFromAccessToken(accessToken) ?? accountEmail ?? '')
        .trim()
        .toLowerCase();
    final id = stillValid || email.isEmpty ? null : await _idSession(email);
    final choice = planIdRenew(
      accessStillValid: stillValid,
      localRefresh: refreshToken,
      expectedEmail: email,
      id: id,
      idAccessUsable: id != null && _idAccessUsable(id.access),
      idAccessEmail: id == null ? '' : (emailFromAccessToken(id.access) ?? ''),
    );
    switch (choice) {
      case IdRenewChoice.keepLocal:
        return (access: accessToken, refresh: refreshToken);
      case IdRenewChoice.useId:
        final nextRefresh = id!.refresh.trim().isNotEmpty ? id.refresh : refreshToken;
        return (access: id.access, refresh: nextRefresh);
      case IdRenewChoice.askServer:
        if (refreshToken.isEmpty) {
          throw AuthException('Session expirée. Reconnectez-vous.');
        }
        return refreshTokens(refreshToken);
      case IdRenewChoice.chooser:
        throw AuthException('Refresh (401): invalid or expired refresh token');
      case IdRenewChoice.hold:
        final idRefresh = id?.refresh.trim() ?? '';
        if (idRefresh.isEmpty) {
          throw AuthException('Hubera ID injoignable');
        }
        return refreshTokens(idRefresh);
    }
  }

  Future<IdSessionView?> _idSession(String email) async {
    if (!CloudityAuthBroker.isSupported) return null;
    try {
      final account = await CloudityAuthBroker.freshAccount(email);
      if (account == null) return null;
      return IdSessionView(
        known: true,
        access: account.accessToken,
        refresh: account.refreshToken,
      );
    } catch (_) {
      return null;
    }
  }

  bool _idAccessUsable(String token) {
    final value = token.trim();
    if (value.isEmpty) return false;
    final exp = accessTokenExpiresAt(value);
    if (exp == null) return true;
    return exp.isAfter(DateTime.now().toUtc().add(const Duration(seconds: 30)));
  }

  Future<bool> validate(String accessToken) async {
    if (accessToken.isEmpty) return false;
    final uri = Uri.parse('$_base/auth/validate');
    try {
      final res = await huberaHttp.get(
        uri,
        headers: authHeaders(accessToken, json: false),
        timeout: const Duration(seconds: 8),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
