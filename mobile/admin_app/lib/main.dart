import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';
import 'features/dashboard_screen.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.admin,
    title: 'Cloudity Admin',
    home: SuiteAppShell<UserSession>(
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      loginBuilder: (onLoggedIn) => AdminLoginScreen(onLoggedIn: onLoggedIn),
      homeBuilder: (session, onLogout) =>
          AdminDashboardScreen(session: session, onLogout: onLogout),
    ),
  );
}

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession();
  if (pair == null) return null;
  try {
    final me = await pair.api.fetchMe(pair.access);
    final role = (me['role'] ?? me['user']?['role'])?.toString().toLowerCase();
    if (role != 'admin') {
      await SessionStore.clearTokens();
      return null;
    }
  } catch (_) {
    return null;
  }
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}
