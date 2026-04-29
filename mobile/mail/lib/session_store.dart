import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_api.dart';
import 'storage_keys.dart';

class SessionStore {
  SessionStore._();

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Future<void> saveSession({
    required String gatewayUrl,
    required String accessToken,
    required String refreshToken,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final base = gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    await prefs.setString(CloudityStorageKeys.gatewayUrl, base);
    await _secure.write(key: CloudityStorageKeys.accessToken, value: accessToken);
    await _secure.write(key: CloudityStorageKeys.refreshToken, value: refreshToken);
  }

  static Future<void> clearTokens() async {
    await _secure.delete(key: CloudityStorageKeys.accessToken);
    await _secure.delete(key: CloudityStorageKeys.refreshToken);
  }

  static Future<String> gatewayOrDefault() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityStorageKeys.gatewayUrl) ?? CloudityStorageKeys.defaultGateway;
  }

  static Future<List<String>> gatewayCandidates() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(CloudityStorageKeys.gatewayUrl);
    final candidates = <String>[
      if (saved != null && saved.trim().isNotEmpty) saved.trim(),
      CloudityStorageKeys.defaultGateway,
      'http://10.0.2.2:6080',
      'http://10.0.3.2:6080',
    ];
    final seen = <String>{};
    final uniq = <String>[];
    for (final c in candidates) {
      final normalized = c.replaceAll(RegExp(r'/$'), '');
      if (normalized.isEmpty) continue;
      if (seen.add(normalized)) uniq.add(normalized);
    }
    return uniq;
  }

  static Future<({AuthApi api, String access, String refresh})?> loadValidatedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final gateway =
        prefs.getString(CloudityStorageKeys.gatewayUrl) ?? CloudityStorageKeys.defaultGateway;
    final refresh = await _secure.read(key: CloudityStorageKeys.refreshToken);
    if (refresh == null || refresh.isEmpty) return null;
    var access = await _secure.read(key: CloudityStorageKeys.accessToken) ?? '';
    final api = AuthApi(gateway);
    try {
      final pair = await api.ensureValidTokens(accessToken: access, refreshToken: refresh);
      await _secure.write(key: CloudityStorageKeys.accessToken, value: pair.access);
      await _secure.write(key: CloudityStorageKeys.refreshToken, value: pair.refresh);
      return (api: api, access: pair.access, refresh: pair.refresh);
    } on AuthException {
      await clearTokens();
      return null;
    } catch (_) {
      return null;
    }
  }
}
