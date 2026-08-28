import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.notes,
    title: 'Cloudity Notes',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.notes,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.notes,
        productTitle: 'Cloudity Notes',
        keyPrefix: 'cloudity_notes',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) => SuiteProductHomeScreen(
        product: SuiteProduct.notes,
        gatewayBase: session.api.baseUrl,
        accessToken: session.accessToken,
        refreshAccessToken: () async {
          await session.refreshIfNeeded();
          return session.accessToken;
        },
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
