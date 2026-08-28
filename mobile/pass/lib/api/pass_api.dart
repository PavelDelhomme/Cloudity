import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:http/http.dart' as http;

/// API client pour `cloudity-passwords-service` (via api-gateway).
///
/// Auth H19 via [CloudityAuthClient] ; métier vaults/items ici.
class PassApi extends CloudityAuthClient {
  PassApi(super.gatewayBase);

  Future<List<Map<String, dynamic>>> fetchVaults(String accessToken) async {
    final res = await http.get(
      Uri.parse('$baseUrl/pass/vaults'),
      headers: authHeaders(accessToken, json: false),
    );
    if (res.statusCode == 401) throw PassException('non_autorisé');
    if (res.statusCode != 200) {
      throw PassException('Vaults HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is List) {
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    if (decoded is Map && decoded['vaults'] is List) {
      return (decoded['vaults'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    }
    throw PassException('Réponse vaults invalide');
  }

  /// Crée un coffre (métadonnées serveur — le chiffrement reste côté client).
  Future<Map<String, dynamic>> createVault({
    required String accessToken,
    required String name,
  }) async {
    final trimmed = name.trim();
    final res = await http.post(
      Uri.parse('$baseUrl/pass/vaults'),
      headers: authHeaders(accessToken),
      body: jsonEncode({'name': trimmed.isEmpty ? 'Mon coffre' : trimmed}),
    );
    if (res.statusCode == 401) throw PassException('non_autorisé');
    if (res.statusCode != 201) {
      final body = res.body.isEmpty ? '' : ' — ${res.body}';
      throw PassException('Création coffre HTTP ${res.statusCode}$body');
    }
    return Map<String, dynamic>.from(jsonDecode(res.body) as Map);
  }

  Future<List<Map<String, dynamic>>> fetchItems({
    required String accessToken,
    required int vaultId,
  }) async {
    final res = await http.get(
      Uri.parse('$baseUrl/pass/vaults/$vaultId/items'),
      headers: authHeaders(accessToken, json: false),
    );
    if (res.statusCode == 401) throw PassException('non_autorisé');
    if (res.statusCode != 200) {
      throw PassException('Items HTTP ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is List) {
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    if (decoded is Map && decoded['items'] is List) {
      return (decoded['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    }
    throw PassException('Réponse items invalide');
  }
}

class PassException implements Exception {
  PassException(this.message);
  final String message;

  @override
  String toString() => message;
}
