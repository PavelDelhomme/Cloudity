import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'features/dashboard_screen.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<bool> _isAdmin(AuthApi api, String access) async {
  try {
    final me = await api.fetchMe(access);
    final role = (me['role'] ?? me['user']?['role'])?.toString().toLowerCase();
    return role == 'admin';
  } catch (_) {
    return false;
  }
}

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) return null;
  if (!await _isAdmin(pair.api, pair.access)) {
    await SessionStore.clearTokens();
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
  if (!await _isAdmin(session.api, session.accessToken)) {
    await SessionStore.clearTokens();
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
