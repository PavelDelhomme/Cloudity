import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'features/files_screen.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Widget _driveShell() => SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.drive,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.drive,
        productTitle: 'Cloudity Drive',
        keyPrefix: 'cloudity_drive',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) =>
          FilesScreen(session: session, onLogout: onLogout),
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.drive,
    title: 'Cloudity Drive',
    home: _driveShell(),
  );
}

/// Alias pour tests widget / intégration.
class CloudityDriveApp extends StatelessWidget {
  const CloudityDriveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return clouditySuiteTestRoot(
      title: 'Cloudity Drive',
      suiteApp: ClouditySuiteApp.drive,
      home: _driveShell(),
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
