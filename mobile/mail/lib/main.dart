import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'features/inbox_screen.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Widget _mailShell() => SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.mail,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        productTitle: 'Cloudity Mail',
        keyPrefix: 'cloudity_mail',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) =>
          InboxScreen(session: session, onLogout: onLogout),
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.mail,
    title: 'Cloudity Mail',
    home: _mailShell(),
  );
}

/// Alias pour tests widget / intégration.
class CloudityMailApp extends StatelessWidget {
  const CloudityMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return clouditySuiteTestRoot(
      title: 'Cloudity Mail',
      suiteApp: ClouditySuiteApp.mail,
      home: _mailShell(),
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
