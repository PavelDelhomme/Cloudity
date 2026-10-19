import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/widgets.dart';

import 'api/auth_api.dart';
import 'auth/user_session.dart';
import 'task_local_reminders.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  huberaTaskReminderHook = scheduleTaskReminders;
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.tasks,
    title: 'Hubera Tasks',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.tasks,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.tasks,
        productTitle: 'Hubera Tasks',
        keyPrefix: 'cloudity_tasks',
        createApi: AuthApi.new,
        adoptDeviceAccount: true,
        onLoggedIn: onLoggedIn,
      ),
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
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) return null;
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}
