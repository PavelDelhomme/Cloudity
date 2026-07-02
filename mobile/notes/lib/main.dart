import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CloudityNotesApp());
}

class CloudityNotesApp extends StatelessWidget {
  const CloudityNotesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: 'Cloudity Notes',
      seedColor: Colors.amber,
      home: SuiteAppShell<UserSession>(
        restoreSession: _restoreSession,
        clearSession: SessionStore.clearTokens,
        loginBuilder: (onLoggedIn) => LoginScreen(onLoggedIn: onLoggedIn),
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
