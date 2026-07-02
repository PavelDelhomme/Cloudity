import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';
import 'features/inbox_screen.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.mail,
    title: 'Cloudity Mail',
    home: SuiteAppShell<UserSession>(
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      loginBuilder: (onLoggedIn) => LoginScreen(onLoggedIn: onLoggedIn),
      homeBuilder: (session, onLogout) =>
          InboxScreen(session: session, onLogout: onLogout),
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
