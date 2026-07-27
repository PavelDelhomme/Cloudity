import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:cloudity_shared/http_helpers.dart';

class AdminApi {
  AdminApi({required String gatewayBase, required this.accessToken})
      : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  final String _base;
  final String accessToken;

  Map<String, String> get _headers => authHeaders(accessToken, json: false);

  Future<List<Map<String, dynamic>>> listTenants() async {
    final res = await http
        .get(Uri.parse('$_base/admin/tenants'), headers: _headers)
        .timeout(const Duration(seconds: 10));
    if (res.statusCode == 401 || res.statusCode == 403) {
      throw AdminApiException('Accès admin refusé (${res.statusCode})');
    }
    if (res.statusCode != 200) {
      throw AdminApiException('Liste tenants indisponible (${res.statusCode})');
    }
    final body = jsonDecode(res.body.isEmpty ? '[]' : res.body);
    if (body is! List) return [];
    return body.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> fetchStats() async {
    final res = await http
        .get(Uri.parse('$_base/admin/stats'), headers: _headers)
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) {
      return {};
    }
    final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    return body is Map<String, dynamic> ? body : {};
  }
}

class AdminApiException implements Exception {
  AdminApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
