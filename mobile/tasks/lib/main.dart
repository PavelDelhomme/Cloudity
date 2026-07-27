import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.tasks,
    title: 'Cloudity Tasks',
    home: SuiteAppShell<UserSession>(
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => LoginScreen(onLoggedIn: onLoggedIn),
      homeBuilder: (session, onLogout) => SuiteProductHomeScreen(
        product: SuiteProduct.tasks,
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
  final pair = await SessionStore.loadValidatedSession();
  if (pair == null) return null;
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}
