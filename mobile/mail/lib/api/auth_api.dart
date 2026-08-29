import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'package:cloudity_shared/cloudity_shared.dart';

export 'package:cloudity_shared/auth/auth_exception.dart';

/// Appels HTTP gateway (auth partagée H19 + mail métier).
class AuthApi extends CloudityAuthClient {
  AuthApi(super.gatewayBase);

  Future<List<Map<String, dynamic>>> fetchMailAccounts(
    String accessToken,
  ) async {
    final uri = Uri.parse('$baseUrl/mail/me/accounts');
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
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

  Future<Map<String, dynamic>> createMailAccount({
    required String accessToken,
    required String email,
    String? label,
    String? password,
  }) async {
    final uri = Uri.parse('$baseUrl/mail/me/accounts');
    final payload = <String, dynamic>{
      'email': email.trim().toLowerCase(),
      if (label != null && label.trim().isNotEmpty) 'label': label.trim(),
      if (password != null && password.isNotEmpty) 'password': password,
    };
    final res = await http.post(
      uri,
      headers: authHeaders(accessToken),
      body: jsonEncode(payload),
    );
    if (res.statusCode == 401) throw AuthException('non_autorisé');
    if (res.statusCode == 409) {
      throw AuthException('Cette adresse est déjà reliée.');
    }
    if (res.statusCode != 201 && res.statusCode != 200) {
      throw AuthException('Création boîte HTTP ${res.statusCode}: ${res.body}');
    }
    return Map<String, dynamic>.from(jsonDecode(res.body) as Map);
  }

  Future<({List<Map<String, dynamic>> messages, int total})> fetchMailMessages({
    required String accessToken,
    required int accountId,
    String folder = 'inbox',
    int limit = 30,
    int offset = 0,
    /// Recherche plein texte serveur (index `search_tsv`) — même paramètre que le web (`q`).
    String? q,
    /// Avec `q` : `date` pour ordre chronologique ; sinon pertinence (`ts_rank_cd`) côté serveur.
    String? sort,
  }) async {
    final params = <String, String>{
      'folder': folder,
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    final t = q?.trim() ?? '';
    if (t.length >= 2) {
      params['q'] = t.length > 200 ? t.substring(0, 200) : t;
      if (sort == 'date') params['sort'] = 'date';
    }
    final uri = Uri.parse('$baseUrl/mail/me/accounts/$accountId/messages').replace(queryParameters: params);
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      throw AuthException('Mail messages HTTP ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    if (data is List) {
      final list = data
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      return (messages: list, total: list.length);
    }
    if (data is Map<String, dynamic>) {
      final raw = data['messages'];
      final list = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];
      final total = data['total'];
      final n = total is int
          ? total
          : (total is num ? total.toInt() : list.length);
      return (messages: list, total: n);
    }
    throw AuthException('Réponse messages invalide');
  }

  /// Totaux / non-lus par dossier (`inbox`, `sent`, … + `extra` pour dossiers IMAP).
  Future<Map<String, dynamic>> fetchFolderSummary({
    required String accessToken,
    required int accountId,
  }) async {
    final uri = Uri.parse('$baseUrl/mail/me/accounts/$accountId/folders/summary');
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
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

  /// Lance une sync IMAP serveur pour une boîte ; retourne le nombre de nouveaux messages détectés.
  Future<int> syncMailAccount({
    required String accessToken,
    required int accountId,
    String? password,
  }) async {
    final uri = Uri.parse('$baseUrl/mail/me/accounts/$accountId/sync');
    final body = <String, dynamic>{};
    if (password != null) body['password'] = password;
    final res = await http.post(
      uri,
      headers: authHeaders(accessToken),
      body: jsonEncode(body.isEmpty ? {'password': ''} : body),
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode == 409) {
      return 0;
    }
    if (res.statusCode != 200) {
      var msg = 'Mail sync HTTP ${res.statusCode}';
      try {
        final data = jsonDecode(res.body);
        if (data is Map && data['error'] != null) {
          msg = data['error'].toString();
        }
      } catch (_) {
        /* corps non JSON */
      }
      throw AuthException(msg);
    }
    if (res.body.isEmpty) return 0;
    final data = jsonDecode(res.body);
    if (data is Map<String, dynamic>) {
      final synced = data['synced'];
      if (synced is int) return synced;
      if (synced is num) return synced.toInt();
    }
    return 0;
  }

  /// Détail d’un message (corps, pièces jointes métadonnées).
  Future<Map<String, dynamic>> fetchMailMessage({
    required String accessToken,
    required int accountId,
    required int messageId,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/mail/me/accounts/$accountId/messages/$messageId',
    );
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
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
    final uri = Uri.parse(
      '$baseUrl/mail/me/accounts/$accountId/messages/$messageId/read',
    );
    final res = await http.patch(
      uri,
      headers: authHeaders(accessToken),
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

  /// `PATCH /mail/me/accounts/:id/messages/:msgId/folder` — corps `{"folder":"spam|trash|archive|inbox"}`.
  Future<void> patchMessageFolder({
    required String accessToken,
    required int accountId,
    required int messageId,
    required String folder,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/mail/me/accounts/$accountId/messages/$messageId/folder',
    );
    final res = await http.patch(
      uri,
      headers: authHeaders(accessToken),
      body: jsonEncode({'folder': folder}),
    );
    if (res.statusCode == 401) {
      throw AuthException('non_autorisé');
    }
    if (res.statusCode != 200) {
      final err = res.body.isEmpty ? '' : res.body;
      throw AuthException('Mail folder HTTP ${res.statusCode}: $err');
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
    final uri = Uri.parse('$baseUrl/mail/me/send');
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
      headers: authHeaders(accessToken),
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
      '$baseUrl/mail/me/accounts/$accountId/messages/$messageId/attachments/$attachmentId',
    );
    final res = await http.get(
      uri,
      headers: authHeaders(accessToken, json: false),
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
