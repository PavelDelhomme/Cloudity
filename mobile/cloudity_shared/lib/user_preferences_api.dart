import 'dart:convert';

import 'package:http/http.dart' as http;

import 'http_helpers.dart';
import 'user_preferences.dart';

/// Client API `GET/PUT /auth/me/preferences` (sync compte utilisateur).
class UserPreferencesApi {
  UserPreferencesApi({
    required this.gatewayBase,
    required this.accessToken,
  });

  final String gatewayBase;
  final String accessToken;

  String get _base => gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  Future<UserPreferencesV1> fetch() async {
    final res = await http
        .get(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw UserPreferencesApiException(
        'GET preferences → ${res.statusCode}: ${res.body.isEmpty ? "erreur" : res.body}',
      );
    }
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    final prefs = map['preferences'];
    return UserPreferencesV1.fromJson(prefs is Map<String, dynamic> ? prefs : null);
  }

  Future<UserPreferencesV1> update(Map<String, dynamic> patch) async {
    final res = await http
        .put(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken),
          body: jsonEncode({'preferences': patch}),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw UserPreferencesApiException(
        'PUT preferences → ${res.statusCode}: ${res.body.isEmpty ? "erreur" : res.body}',
      );
    }
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    final prefs = map['preferences'];
    final merged = UserPreferencesV1.fromJson(prefs is Map<String, dynamic> ? prefs : null);
    await UserPreferencesStore.saveCached(merged);
    return merged;
  }

  /// Télécharge les préférences serveur et met à jour le cache local.
  Future<UserPreferencesV1> syncToCache() async {
    final remote = await fetch();
    await UserPreferencesStore.saveCached(remote);
    return remote;
  }
}

class UserPreferencesApiException implements Exception {
  UserPreferencesApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
