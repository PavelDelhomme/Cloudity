import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../storage_keys.dart';
import '../suite_gateway_config.dart';
import 'auth_client.dart';

const _sessionRestoreTimeout = Duration(seconds: 10);

/// Persistance session + broker Android (H19 — une seule copie).
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
    final email = await _secure.read(key: CloudityStorageKeys.accountEmail);
    if (CloudityAuthBroker.isSupported && email != null && email.isNotEmpty) {
      await CloudityAuthBroker.saveSession(
        CloudityAuthAccount(
          email: email,
          gatewayUrl: base,
          accessToken: accessToken,
          refreshToken: refreshToken,
        ),
      );
    }
  }

  static Future<void> saveSessionWithEmail({
    required String gatewayUrl,
    required String accessToken,
    required String refreshToken,
    required String email,
    int tenantId = 1,
    String? userId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final base = gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    await prefs.setString(CloudityStorageKeys.gatewayUrl, base);
    await _secure.write(key: CloudityStorageKeys.accessToken, value: accessToken);
    await _secure.write(key: CloudityStorageKeys.refreshToken, value: refreshToken);
    await _secure.write(key: CloudityStorageKeys.accountEmail, value: email.trim());
    await prefs.setInt(CloudityStorageKeys.tenantId, tenantId);
    if (userId != null && userId.isNotEmpty) {
      await _secure.write(key: CloudityStorageKeys.userId, value: userId);
    }
    if (CloudityAuthBroker.isSupported) {
      await CloudityAuthBroker.saveSession(
        CloudityAuthAccount(
          email: email.trim(),
          gatewayUrl: base,
          accessToken: accessToken,
          refreshToken: refreshToken,
          tenantId: tenantId,
        ),
      );
    }
  }

  /// Efface les jetons locaux + compte broker (logout complet). Conserve l’URL gateway.
  static Future<void> clearTokens() async {
    final email = await _secure.read(key: CloudityStorageKeys.accountEmail);
    await _secure.delete(key: CloudityStorageKeys.accessToken);
    await _secure.delete(key: CloudityStorageKeys.refreshToken);
    await _secure.delete(key: CloudityStorageKeys.accountEmail);
    if (CloudityAuthBroker.isSupported && email != null && email.isNotEmpty) {
      await CloudityAuthBroker.clearAccount(email);
    }
  }

  /// Logout Pass : jetons + userId + secrets biométrie / MK wrappée.
  static Future<void> clearIncludingPassSecrets() async {
    await clearTokens();
    await _secure.delete(key: CloudityStorageKeys.userId);
    await _secure.delete(key: CloudityStorageKeys.secureMkWrapped);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(CloudityStorageKeys.biometricEnabled);
    await prefs.remove(CloudityStorageKeys.userEmail);
  }

  static Future<String?> readUserId() =>
      _secure.read(key: CloudityStorageKeys.userId);

  static bool get hasBuildGateway => SuiteGatewayConfig.hasDartDefine;

  static Future<String> gatewayOrDefault() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityStorageKeys.gatewayUrl) ??
        (SuiteGatewayConfig.hasDartDefine
            ? SuiteGatewayConfig.fromDartDefine
            : CloudityStorageKeys.defaultGateway);
  }

  static Future<List<String>> gatewayCandidates() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(CloudityStorageKeys.gatewayUrl);
    return SuiteGatewayConfig.candidates(savedGateway: saved);
  }

  static Future<List<CloudityAuthAccount>> listBrokerAccounts() =>
      CloudityAuthBroker.listAccounts();

  static Future<String?> readAccountEmail() =>
      _secure.read(key: CloudityStorageKeys.accountEmail);

  static Future<int> readTenantId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(CloudityStorageKeys.tenantId) ?? 1;
  }

  /// Restaure une session valide. [createApi] instancie le client métier de l’app
  /// (`AuthApi` Mail/Drive/… qui étend [CloudityAuthClient]).
  static Future<({T api, String access, String refresh})?> loadValidatedSession<
      T extends CloudityAuthClient>({
    required T Function(String gateway) createApi,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    var gateway =
        prefs.getString(CloudityStorageKeys.gatewayUrl) ?? CloudityStorageKeys.defaultGateway;
    var refresh = await _secure.read(key: CloudityStorageKeys.refreshToken) ?? '';
    var access = await _secure.read(key: CloudityStorageKeys.accessToken) ?? '';
    if (refresh.isEmpty) {
      final broker = await CloudityAuthBroker.listAccounts();
      if (broker.isEmpty) return null;
      final acc = broker.first;
      gateway = acc.gatewayUrl;
      refresh = acc.refreshToken;
      access = acc.accessToken;
      await saveSessionWithEmail(
        gatewayUrl: gateway,
        accessToken: access,
        refreshToken: refresh,
        email: acc.email,
        tenantId: acc.tenantId,
      );
    }
    if (refresh.isEmpty) return null;
    final api = createApi(gateway);
    try {
      final pair = await api
          .ensureValidTokens(accessToken: access, refreshToken: refresh)
          .timeout(_sessionRestoreTimeout);
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
