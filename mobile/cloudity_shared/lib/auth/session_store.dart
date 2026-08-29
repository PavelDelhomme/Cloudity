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

  /// Efface uniquement la session **locale** (ne touche pas le broker des autres apps).
  static Future<void> clearLocalTokens() async {
    await _secure.delete(key: CloudityStorageKeys.accessToken);
    await _secure.delete(key: CloudityStorageKeys.refreshToken);
    await _secure.delete(key: CloudityStorageKeys.accountEmail);
  }

  /// Logout explicite : jetons locaux + compte broker (toutes les apps).
  static Future<void> clearTokens() async {
    final email = await _secure.read(key: CloudityStorageKeys.accountEmail);
    await clearLocalTokens();
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

    // Ne pas rester bloqué sur une gateway LAN/USB périmée stockée dans le broker.
    final gateways = SuiteGatewayConfig.candidates(savedGateway: gateway);
    AuthException? lastAuth;
    for (final gw in gateways) {
      final api = createApi(gw);
      try {
        final pair = await api
            .ensureValidTokens(accessToken: access, refreshToken: refresh)
            .timeout(_sessionRestoreTimeout);
        final email = await _secure.read(key: CloudityStorageKeys.accountEmail);
        if (email != null && email.isNotEmpty) {
          await saveSessionWithEmail(
            gatewayUrl: gw,
            accessToken: pair.access,
            refreshToken: pair.refresh,
            email: email,
            tenantId: await readTenantId(),
            userId: await readUserId(),
          );
        } else {
          await saveSession(
            gatewayUrl: gw,
            accessToken: pair.access,
            refreshToken: pair.refresh,
          );
        }
        return (api: api, access: pair.access, refresh: pair.refresh);
      } on AuthException catch (e) {
        lastAuth = e;
        if (e.message.toLowerCase().contains('refresh') ||
            e.message.contains('401')) {
          break;
        }
      } catch (_) {
        // Essayer la gateway suivante.
      }
    }
    try {
      throw lastAuth ?? AuthException('Session invalide');
    } on AuthException catch (e) {
      // Refresh mort localement → tenter les autres copies broker (Drive/Mail/…).
      if (e.message.toLowerCase().contains('refresh') &&
          CloudityAuthBroker.isSupported) {
        final recovered = await _tryBrokerCopies(
          createApi: createApi,
          preferredGateway: gateway,
        );
        if (recovered != null) return recovered;
      }
      // Ne PAS clearTokens() ici : ça effaçait le broker de **toutes** les apps
      // et tuait la session Drive/Mail encore valide → 401 en chaîne.
      await clearLocalTokens();
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Essaie chaque refresh distinct du broker jusqu’à succès, puis propage.
  static Future<({T api, String access, String refresh})?> _tryBrokerCopies<
      T extends CloudityAuthClient>({
    required T Function(String gateway) createApi,
    required String preferredGateway,
  }) async {
    final copies = await CloudityAuthBroker.listAllAccountCopies();
    if (copies.isEmpty) return null;
    final tried = <String>{};
    for (final acc in copies) {
      if (!tried.add(acc.refreshToken)) continue;
      final gateways = SuiteGatewayConfig.candidates(
        savedGateway: acc.gatewayUrl.isNotEmpty ? acc.gatewayUrl : preferredGateway,
      );
      for (final gw in gateways) {
        final api = createApi(gw);
        try {
          final pair = await api
              .ensureValidTokens(
                accessToken: acc.accessToken,
                refreshToken: acc.refreshToken,
              )
              .timeout(_sessionRestoreTimeout);
          await saveSessionWithEmail(
            gatewayUrl: gw,
            accessToken: pair.access,
            refreshToken: pair.refresh,
            email: acc.email,
            tenantId: acc.tenantId,
          );
          return (api: api, access: pair.access, refresh: pair.refresh);
        } catch (_) {
          continue;
        }
      }
    }
    return null;
  }
}
