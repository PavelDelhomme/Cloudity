import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Widget _calendarShell() => SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.calendar,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.calendar,
        productTitle: 'Cloudity Calendar',
        keyPrefix: 'cloudity_calendar',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) => SuiteProductHomeScreen(
        product: SuiteProduct.calendar,
        gatewayBase: session.api.baseUrl,
        accessToken: session.accessToken,
        refreshAccessToken: () async {
          await session.refreshIfNeeded();
          return session.accessToken;
        },
        onLogout: onLogout,
      ),
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.calendar,
    title: 'Cloudity Calendar',
    home: _calendarShell(),
  );
}

/// Alias pour tests widget / intégration.
class CloudityCalendarApp extends StatelessWidget {
  const CloudityCalendarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return clouditySuiteTestRoot(
      title: 'Cloudity Calendar',
      suiteApp: ClouditySuiteApp.calendar,
      home: _calendarShell(),
    );
  }
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
