import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/pass_api.dart';
import 'package:cloudity_shared/storage_keys.dart';
import 'package:cloudity_shared/suite_gateway_config.dart';

const _sessionRestoreTimeout = Duration(seconds: 10);

/// Stockage session Pass (JWT + gateway). Ne contient jamais la master key.
class PassSessionStore {
  PassSessionStore._();

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Future<void> saveSession({
    required String gatewayUrl,
    required String accessToken,
    required String refreshToken,
    String? userId,
    String? email,
    String? userEmail,
    int tenantId = 1,
  }) async {
    final resolvedEmail = (userEmail ?? email)?.trim();
    final prefs = await SharedPreferences.getInstance();
    final base = gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    await prefs.setString(CloudityStorageKeys.gatewayUrl, base);
    await _secure.write(key: CloudityStorageKeys.accessToken, value: accessToken);
    await _secure.write(key: CloudityStorageKeys.refreshToken, value: refreshToken);
    if (userId != null && userId.isNotEmpty) {
      await _secure.write(key: CloudityStorageKeys.userId, value: userId);
    }
    if (resolvedEmail != null && resolvedEmail.isNotEmpty) {
      await _secure.write(key: CloudityStorageKeys.accountEmail, value: resolvedEmail);
      await prefs.setString(CloudityStorageKeys.userEmail, resolvedEmail);
    }
    await prefs.setInt(CloudityStorageKeys.tenantId, tenantId);
    if (CloudityAuthBroker.isSupported && resolvedEmail != null && resolvedEmail.isNotEmpty) {
      await CloudityAuthBroker.saveSession(
        CloudityAuthAccount(
          email: resolvedEmail,
          gatewayUrl: base,
          accessToken: accessToken,
          refreshToken: refreshToken,
          tenantId: tenantId,
        ),
      );
    }
  }

  static Future<void> clearTokens() async {
    final email = await _secure.read(key: CloudityStorageKeys.accountEmail);
    await _secure.delete(key: CloudityStorageKeys.accessToken);
    await _secure.delete(key: CloudityStorageKeys.refreshToken);
    await _secure.delete(key: CloudityStorageKeys.accountEmail);
    if (CloudityAuthBroker.isSupported && email != null && email.isNotEmpty) {
      await CloudityAuthBroker.clearAccount(email);
    }
  }

  static Future<void> clearAll() async {
    await clearTokens();
    await _secure.delete(key: CloudityStorageKeys.userId);
    await _secure.delete(key: CloudityStorageKeys.secureMkWrapped);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(CloudityStorageKeys.biometricEnabled);
    await prefs.remove(CloudityStorageKeys.userEmail);
  }

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

  static Future<String?> readUserEmail() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityStorageKeys.userEmail) ??
        _secure.read(key: CloudityStorageKeys.accountEmail);
  }

  static Future<({PassApi api, String access, String refresh, String? userId})?>
      loadValidatedSession() async {
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
      await saveSession(
        gatewayUrl: gateway,
        accessToken: access,
        refreshToken: refresh,
        email: acc.email,
        tenantId: acc.tenantId,
      );
    }
    if (refresh.isEmpty) return null;
    final api = PassApi(gateway);
    try {
      final pair = await api
          .ensureValidTokens(accessToken: access, refreshToken: refresh)
          .timeout(_sessionRestoreTimeout);
      await _secure.write(key: CloudityStorageKeys.accessToken, value: pair.access);
      await _secure.write(key: CloudityStorageKeys.refreshToken, value: pair.refresh);
      final userId = await _secure.read(key: CloudityStorageKeys.userId);
      return (api: api, access: pair.access, refresh: pair.refresh, userId: userId);
    } on PassException {
      await clearTokens();
      return null;
    } catch (_) {
      return null;
    }
  }
}
