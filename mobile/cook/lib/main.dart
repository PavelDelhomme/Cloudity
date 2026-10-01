import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'cook_home.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.cook,
    title: 'Hubera Cook',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.cook,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.cook,
        productTitle: 'Hubera Cook',
        keyPrefix: 'cloudity_cook',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) => CookHomeScreen(
        gatewayBase: session.api.baseUrl,
        accessToken: session.accessToken,
        userEmail: null,
        onLogout: onLogout,
      ),
    ),
  );
}

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) return null;
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}
