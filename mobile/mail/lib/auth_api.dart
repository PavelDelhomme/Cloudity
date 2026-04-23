import 'dart:convert';
import 'dart:typed_data';

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

  /// Totaux / non-lus par dossier (`inbox`, `sent`, … + `extra` pour dossiers IMAP).
  Future<Map<String, dynamic>> fetchFolderSummary({
    required String accessToken,
    required int accountId,
  }) async {
    final uri = Uri.parse('$_base/mail/me/accounts/$accountId/folders/summary');
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Mail dossiers HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! Map<String, dynamic>) {
      throw AuthException('Réponse dossiers invalide');
    }
    return data;
  }

  /// Détail d’un message (corps, pièces jointes métadonnées).
  Future<Map<String, dynamic>> fetchMailMessage({
    required String accessToken,
    required int accountId,
    required int messageId,
  }) async {
    final uri = Uri.parse('$_base/mail/me/accounts/$accountId/messages/$messageId');
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Mail message HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is! Map<String, dynamic>) {
      throw AuthException('Réponse message invalide');
    }
    return data;
  }

  /// `PATCH /mail/me/accounts/:id/messages/:msgId/read` — corps `{"read": true|false}`.
  Future<void> patchMessageRead({
    required String accessToken,
    required int accountId,
    required int messageId,
    required bool read,
  }) async {
    final uri = Uri.parse('$_base/mail/me/accounts/$accountId/messages/$messageId/read');
    final res = await http.patch(
      uri,
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'read': read}),
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      final err = res.body.isEmpty ? '' : res.body;
      throw AuthException('Mail read HTTP ${res.statusCode}: $err');
    }
  }

  /// `POST /mail/me/send` — texte brut ; `password` si absent en base (OAuth = autre flux).
  Future<void> sendMail({
    required String accessToken,
    required int accountId,
    required String to,
    String subject = '',
    String body = '',
    String? password,
  }) async {
    final uri = Uri.parse('$_base/mail/me/send');
    final payload = <String, dynamic>{
      'account_id': accountId,
      'to': to,
      'subject': subject,
      'body': body,
    };
    if (password != null && password.isNotEmpty) {
      payload['password'] = password;
    }
    final res = await http.post(
      uri,
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(payload),
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      final err = res.body.isEmpty ? '' : res.body;
      throw AuthException('Envoi HTTP ${res.statusCode}: $err');
    }
  }

  /// Corps binaire d’une pièce jointe (Bearer requis).
  Future<Uint8List> downloadMailAttachment({
    required String accessToken,
    required int accountId,
    required int messageId,
    required int attachmentId,
  }) async {
    final uri = Uri.parse(
      '$_base/mail/me/accounts/$accountId/messages/$messageId/attachments/$attachmentId',
    );
    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('PJ HTTP ${res.statusCode}');
    }
    return res.bodyBytes;
  }
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
