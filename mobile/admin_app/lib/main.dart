import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/admin_refresh.dart';
import 'auth/user_session.dart';
import 'features/admin_home.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<bool?> _adminRoleOrNull(AuthApi api, String access) async {
  // Pas d’endpoint /auth/me fiable : le rôle admin est dans le JWT.
  final role = roleFromAccessToken(access);
  if (role == null) {
    // Jeton illisible — vérifier au moins que la gateway répond.
    try {
      if (!await api.authHealth()) return null;
    } catch (_) {
      return null;
    }
    return false;
  }
  return role == 'admin';
}

Future<List<({String email, String refresh})>> _refreshCopies() async {
  try {
    final copies = await CloudityAuthBroker.listAllAccountCopies();
    return [
      for (final copy in copies) (email: copy.email, refresh: copy.refreshToken),
    ];
  } catch (_) {
    return const [];
  }
}

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) return null;
  final email = emailFromAccessToken(pair.access) ?? await SessionStore.readAccountEmail();
  final AdminRefreshResult recovered;
  try {
    recovered = await recoverAdminRefresh(
      access: pair.access,
      refresh: pair.refresh,
      expectedEmail: email,
      listCopies: _refreshCopies,
      refreshTokens: (access, refresh) => pair.api.ensureValidTokens(
        accessToken: access,
        refreshToken: refresh,
      ),
    );
  } on AuthException catch (error) {
    if (!adminRefreshTokenRejected(error)) rethrow;
    debugPrint('Admin: refresh refusé, choix de compte (${pair.api.baseUrl})');
    await SessionStore.clearLocalTokens();
    return null;
  }
  if (recovered.openChooser) {
    // Jeton mort : ne pas le réafficher, ne pas le renvoyer au prochain lancement.
    debugPrint('Admin: refresh refusé, choix de compte (${pair.api.baseUrl})');
    await SessionStore.clearLocalTokens();
    return null;
  }
  final isAdmin = await _adminRoleOrNull(pair.api, recovered.access);
  if (isAdmin == null) {
    // Gateway injoignable : garder le broker des autres apps, session locale seule.
    await SessionStore.clearLocalTokens();
    return null;
  }
  if (!isAdmin) {
    // Compte user classique — ne pas effacer Drive/Mail/Notes.
    await SessionStore.clearLocalTokens();
    return null;
  }
  if (recovered.access != pair.access || recovered.refresh != pair.refresh) {
    final savedEmail = emailFromAccessToken(recovered.access) ?? email ?? '';
    if (savedEmail.isNotEmpty) {
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: pair.api.baseUrl,
        accessToken: recovered.access,
        refreshToken: recovered.refresh,
        email: savedEmail,
        tenantId: await SessionStore.readTenantId(),
        userId: await SessionStore.readUserId(),
      );
    } else {
      await SessionStore.saveSession(
        gatewayUrl: pair.api.baseUrl,
        accessToken: recovered.access,
        refreshToken: recovered.refresh,
      );
    }
    debugPrint('Admin: session renouvelée (${pair.api.baseUrl})');
  }
  return UserSession(
    api: pair.api,
    accessToken: recovered.access,
    refreshToken: recovered.refresh,
  );
}

Future<void> _onLoggedIn(
  CloudityUserSession<AuthApi> session,
  void Function(UserSession session) onLoggedIn,
) async {
  final isAdmin = await _adminRoleOrNull(session.api, session.accessToken);
  if (isAdmin == null) {
    throw AuthException(
      'Gateway Hubera injoignable. Vérifie la connexion puis réessaie.',
    );
  }
  if (!isAdmin) {
    await SessionStore.clearLocalTokens();
    throw AuthException('Compte non administrateur.');
  }
  onLoggedIn(
    UserSession(
      api: session.api,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    ),
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.admin,
    title: 'Hubera Admin',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.admin,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.admin,
        productTitle: 'Hubera Admin',
        keyPrefix: 'cloudity_admin',
        createApi: AuthApi.new,
        onLoggedIn: (s) => _onLoggedIn(s, onLoggedIn),
      ),
      homeBuilder: (session, onLogout) =>
          AdminHome(session: session, onLogout: onLogout),
    ),
  );
}
