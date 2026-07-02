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

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) {
    await GallerySyncPrefs.reconcileOnStartup();
    await ensureGalleryBackupNotifications();
    await Workmanager().initialize(gallerySyncCallbackDispatcher);
    await applyGallerySyncSchedule();
  }
  runApp(CloudityThemedApp(
    key: _appKey,
    title: 'Cloudity Photos',
    seedColor: Colors.teal,
    home: const _PhotosShell(),
  ));
}

/// Alias conservé pour les tests widget / intégration.
class CloudityPhotosApp extends StatelessWidget {
  const CloudityPhotosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const CloudityThemedApp(
      title: 'Cloudity Photos',
      seedColor: Colors.teal,
      home: _PhotosShell(),
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
