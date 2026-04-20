import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_api.dart';
import 'storage_keys.dart';

/// Persistance URL gateway + jetons (convention suite — voir `storage_keys.dart`).
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

  /// Efface les jetons ; conserve l’URL gateway pour la prochaine connexion.
  static Future<void> clearTokens() async {
    await _secure.delete(key: CloudityStorageKeys.accessToken);
    await _secure.delete(key: CloudityStorageKeys.refreshToken);
  }

  static Future<String> gatewayOrDefault() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityStorageKeys.gatewayUrl) ?? CloudityStorageKeys.defaultGateway;
  }

  /// Retourne une session prête si refresh valide ; sinon `null`.
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
