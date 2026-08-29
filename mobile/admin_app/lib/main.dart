import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'features/dashboard_screen.dart';

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

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) return null;
  final isAdmin = await _adminRoleOrNull(pair.api, pair.access);
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
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}

Future<void> _onLoggedIn(
  CloudityUserSession<AuthApi> session,
  void Function(UserSession session) onLoggedIn,
) async {
  final isAdmin = await _adminRoleOrNull(session.api, session.accessToken);
  if (isAdmin == null) {
    throw AuthException(
      'Gateway Cloudity injoignable. Vérifie la connexion puis réessaie.',
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
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.admin,
    title: 'Cloudity Admin',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.admin,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.admin,
        productTitle: 'Cloudity Admin',
        keyPrefix: 'cloudity_admin',
        createApi: AuthApi.new,
        onLoggedIn: (s) => _onLoggedIn(s, onLoggedIn),
      ),
      homeBuilder: (session, onLogout) =>
          AdminDashboardScreen(session: session, onLogout: onLogout),
    ),
  );
}
