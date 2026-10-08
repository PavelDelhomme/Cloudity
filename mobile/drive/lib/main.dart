import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'features/files_screen.dart';
import 'updates/update_checker.dart';

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
        productTitle: 'Hubera Drive',
        keyPrefix: 'cloudity_drive',
        createApi: AuthApi.new,
        onLoggedIn: onLoggedIn,
      ),
      homeBuilder: (session, onLogout) =>
          FilesScreen(session: session, onLogout: onLogout),
    );

Future<void> main() async {
  unawaited(
    HuberaUpdateChecker(slug: 'drive', currentVersion: '1.0.6').check().then((info) {
      if (info != null) {
        debugPrint('Hubera update drive ${info.version} ${info.apk}');
      }
    }),
  );
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.drive,
    title: 'Hubera Drive',
    home: _driveShell(),
  );
}

/// Alias pour tests widget / intégration.
class CloudityDriveApp extends StatelessWidget {
  const CloudityDriveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return clouditySuiteTestRoot(
      title: 'Hubera Drive',
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
