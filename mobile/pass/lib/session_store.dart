import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cloudity_shared/suite_defaults.dart';
import 'storage_keys.dart';

const String _kBuildGateway = String.fromEnvironment('CLOUDITY_GATEWAY_URL', defaultValue: '');
const String _kE2EGateway = String.fromEnvironment('CLOUDITY_E2E_GATEWAY', defaultValue: '');

String get _buildGateway {
  final configured = _kBuildGateway.trim();
  if (configured.isNotEmpty) return configured;
  return _kE2EGateway.trim();
}

/// Stockage local de la session d'authentification (gateway URL + tokens JWT).
///
/// **Important Pass** : la session ne donne accès qu'à la **liste chiffrée**
/// des vaults/items (le serveur ne voit jamais le clair). Pour décoder les
/// items il faut en plus la **master key**, déterminée à l'unlock par
/// Argon2id sur le mot de passe maître. Donc même si un attaquant exfiltre
/// l'access_token, il ne peut PAS lire le coffre.
class PassSessionStore {
  PassSessionStore._();

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Future<void> saveSession({
    required String gatewayUrl,
    required String accessToken,
    required String refreshToken,
    required String userId,
    String? userEmail,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final base = gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    await prefs.setString(CloudityPassStorageKeys.gatewayUrl, base);
    await _secure.write(key: CloudityPassStorageKeys.accessToken, value: accessToken);
    await _secure.write(key: CloudityPassStorageKeys.refreshToken, value: refreshToken);
    if (userId.isNotEmpty) {
      await _secure.write(key: CloudityPassStorageKeys.userId, value: userId);
    }
    if (userEmail != null && userEmail.isNotEmpty) {
      await prefs.setString(CloudityPassStorageKeys.userEmail, userEmail);
      if (CloudityAuthBroker.isSupported) {
        await CloudityAuthBroker.saveSession(
          CloudityAuthAccount(
            email: userEmail.trim(),
            gatewayUrl: base,
            accessToken: accessToken,
            refreshToken: refreshToken,
          ),
        );
      }
    }
  }

  static Future<void> clearTokens() async {
    await _secure.delete(key: CloudityPassStorageKeys.accessToken);
    await _secure.delete(key: CloudityPassStorageKeys.refreshToken);
  }

  /// **Logout complet** — efface aussi user_id, biometric flag et clé wrappée.
  static Future<void> clearAll() async {
    await clearTokens();
    await _secure.delete(key: CloudityPassStorageKeys.userId);
    await _secure.delete(key: CloudityPassStorageKeys.secureMkWrapped);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(CloudityPassStorageKeys.biometricEnabled);
    await prefs.remove(CloudityPassStorageKeys.userEmail);
  }

  static bool get hasBuildGateway => _buildGateway.isNotEmpty;

  static Future<String> gatewayOrDefault() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityPassStorageKeys.gatewayUrl) ??
        (_buildGateway.isNotEmpty ? _buildGateway : CloudityPassStorageKeys.defaultGateway);
  }

  static Future<String?> readUserId() async {
    return _secure.read(key: CloudityPassStorageKeys.userId);
  }

  static Future<String?> readUserEmail() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityPassStorageKeys.userEmail);
  }

  /// Tente de restaurer une session existante (rotation refresh-token si besoin).
  ///
  /// Retourne `null` si aucune session valide. **Ne déverrouille pas** le
  /// coffre — l'app affichera l'écran d'unlock si la session est OK mais qu'il
  /// n'y a pas de master key en mémoire.
  static Future<({PassApi api, String access, String refresh, String? userId})?>
      loadValidatedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final gateway = prefs.getString(CloudityPassStorageKeys.gatewayUrl) ??
        (_buildGateway.isNotEmpty ? _buildGateway : CloudityPassStorageKeys.defaultGateway);
    final refresh = await _secure.read(key: CloudityPassStorageKeys.refreshToken);
    if (refresh == null || refresh.isEmpty) return null;
    var access = await _secure.read(key: CloudityPassStorageKeys.accessToken) ?? '';
    final api = PassApi(gateway);
    try {
      final pair = await api.ensureValidTokens(accessToken: access, refreshToken: refresh);
      await _secure.write(key: CloudityPassStorageKeys.accessToken, value: pair.access);
      await _secure.write(key: CloudityPassStorageKeys.refreshToken, value: pair.refresh);
      final userId = await _secure.read(key: CloudityPassStorageKeys.userId);
      return (api: api, access: pair.access, refresh: pair.refresh, userId: userId);
    } on PassException {
      await clearTokens();
      return null;
    } catch (_) {
      return null;
    }
  }
}
