import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';
import 'features/inbox_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CloudityMailApp());
}

class CloudityMailApp extends StatelessWidget {
  const CloudityMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: 'Cloudity Mail',
      seedColor: Colors.teal,
      home: SuiteAppShell<UserSession>(
        restoreSession: _restoreSession,
        clearSession: SessionStore.clearTokens,
        loginBuilder: (onLoggedIn) => LoginScreen(onLoggedIn: onLoggedIn),
        homeBuilder: (session, onLogout) =>
            InboxScreen(session: session, onLogout: onLogout),
      ),
    );
  }
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
