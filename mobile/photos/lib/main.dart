import 'dart:io';

import 'package:flutter/material.dart';
import 'package:workmanager/workmanager.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';
import 'features/gallery_backup_notifications.dart';
import 'features/gallery_sync_prefs.dart';
import 'features/gallery_sync_scheduler.dart';
import 'features/gallery_sync_worker.dart';
import 'features/timeline_screen.dart';

final _appKey = GlobalKey<CloudityThemedAppState>();

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.photos,
    title: 'Cloudity Photos',
    appKey: _appKey,
    beforeRun: () async {
      if (Platform.isAndroid) {
        await GallerySyncPrefs.reconcileOnStartup();
        await ensureGalleryBackupNotifications();
        await Workmanager().initialize(gallerySyncCallbackDispatcher);
        await applyGallerySyncSchedule();
      }
    },
    home: const _PhotosShell(),
  );
}

/// Alias conservé pour les tests widget / intégration.
class CloudityPhotosApp extends StatelessWidget {
  const CloudityPhotosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp.forSuite(
      title: 'Cloudity Photos',
      suiteApp: ClouditySuiteApp.photos,
      home: const _PhotosShell(),
    );
  }
}

class _PhotosShell extends StatelessWidget {
  const _PhotosShell();

  @override
  Widget build(BuildContext context) {
    return SuiteAppShell<UserSession>(
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => LoginScreen(
        onLoggedIn: (session) {
          onLoggedIn(session);
          if (Platform.isAndroid) {
            resumeGalleryBackupAfterLogin();
          }
        },
      ),
      homeBuilder: (session, onLogout) =>
          TimelineScreen(session: session, onLogout: onLogout),
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
