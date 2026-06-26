import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_api.dart';
import 'storage_keys.dart';

const _sessionRestoreTimeout = Duration(seconds: 10);
const String _kBuildGateway = String.fromEnvironment('CLOUDITY_GATEWAY_URL', defaultValue: '');
const String _kE2EGateway = String.fromEnvironment('CLOUDITY_E2E_GATEWAY', defaultValue: '');

String get _buildGateway {
  final configured = _kBuildGateway.trim();
  if (configured.isNotEmpty) return configured;
  return _kE2EGateway.trim();
}

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
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final base = gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    await prefs.setString(CloudityStorageKeys.gatewayUrl, base);
    await _secure.write(key: CloudityStorageKeys.accessToken, value: accessToken);
    await _secure.write(key: CloudityStorageKeys.refreshToken, value: refreshToken);
    await _secure.write(key: CloudityStorageKeys.accountEmail, value: email.trim());
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

  static bool get hasBuildGateway => _buildGateway.isNotEmpty;

  static Future<String> gatewayOrDefault() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(CloudityStorageKeys.gatewayUrl) ??
        (_buildGateway.isNotEmpty ? _buildGateway : CloudityStorageKeys.defaultGateway);
  }

  static Future<List<String>> gatewayCandidates() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(CloudityStorageKeys.gatewayUrl);
    final candidates = <String>[
      if (_buildGateway.isNotEmpty) _buildGateway,
      'http://127.0.0.1:6002',
      if (saved != null && saved.trim().isNotEmpty) saved.trim(),
      CloudityStorageKeys.defaultGateway,
      'http://10.0.2.2:6002',
      'http://10.0.3.2:6002',
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

  /// Comptes déjà connectés sur une autre app Cloudity (Android, même signature).
  static Future<List<CloudityAuthAccount>> listBrokerAccounts() =>
      CloudityAuthBroker.listAccounts();

  /// Retourne une session prête si refresh valide ; sinon `null`.
  static Future<({AuthApi api, String access, String refresh})?> loadValidatedSession() async {
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
    final api = AuthApi(gateway);
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
