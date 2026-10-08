import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:cloudity_shared/http_helpers.dart';

class AdminApi {
  AdminApi({required String gatewayBase, required this.accessToken})
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;
  final String accessToken;

  static const fallbackGateway = 'https://cloudity.delhomme.ovh';

  Map<String, String> get _headers => authHeaders(accessToken, json: false);

  List<String> get _bases {
    final seen = <String>{};
    final out = <String>[];
    for (final b in [_base, if (_base != fallbackGateway) fallbackGateway]) {
      if (seen.add(b)) out.add(b);
    }
    return out;
  }

  Future<List<Map<String, dynamic>>> listTenants() async {
    AdminApiException? last;
    for (final base in _bases) {
      try {
        return await _listTenantsAt(base);
      } on AdminApiException catch (e) {
        last = e;
      }
    }
    throw last ?? AdminApiException('Liste tenants indisponible');
  }

  Future<List<Map<String, dynamic>>> _listTenantsAt(String base) async {
    final res = await http
        .get(Uri.parse('$base/admin/tenants'), headers: _headers)
        .timeout(const Duration(seconds: 12));
    if (res.statusCode == 401 || res.statusCode == 403) {
      throw AdminApiException('Accès admin refusé (${res.statusCode})');
    }
    if (res.statusCode != 200) {
      throw AdminApiException(_htmlOrStatus(res, 'Liste tenants'));
    }
    final body = _decodeJson(res, what: 'tenants');
    if (body is! List) return [];
    return body
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>> fetchStats() async {
    for (final base in _bases) {
      try {
        final res = await http
            .get(Uri.parse('$base/admin/stats'), headers: _headers)
            .timeout(const Duration(seconds: 10));
        if (res.statusCode != 200) continue;
        final body = _decodeJson(res, what: 'stats');
        if (body is Map<String, dynamic>) return body;
      } catch (_) {}
    }
    return {};
  }

  dynamic _decodeJson(http.Response res, {required String what}) {
    final raw = res.body;
    final trimmed = raw.trimLeft();
    final ct = (res.headers['content-type'] ?? '').toLowerCase();
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
      throw AdminApiException(
        'L’API $what a renvoyé une page HTML au lieu de JSON. '
        'Hubera ID ne proxifie pas /admin — bascule sur la passerelle Mail/Drive live.',
      );
    }
    if (ct.isNotEmpty && !ct.contains('json') && !ct.contains('text/plain')) {
      throw AdminApiException('Réponse $what inattendue ($ct)');
    }
    try {
      return jsonDecode(raw.isEmpty ? '{}' : raw);
    } on FormatException {
      throw AdminApiException('Réponse $what illisible (pas du JSON).');
    }
  }

  String _htmlOrStatus(http.Response res, String what) {
    final t = res.body.trimLeft().toLowerCase();
    if (t.startsWith('<!doctype') || t.startsWith('<html')) {
      return '$what indisponible : le serveur a renvoyé une page web (${res.statusCode}).';
    }
    return '$what indisponible (${res.statusCode})';
  }
}

class AdminApiException implements Exception {
  AdminApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
