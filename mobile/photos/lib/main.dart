import 'dart:io';

import 'package:flutter/material.dart';
import 'package:workmanager/workmanager.dart';

import 'gallery_sync_scheduler.dart';
import 'gallery_sync_worker.dart';
import 'login_screen.dart';
import 'session_store.dart';
import 'timeline_screen.dart';
import 'user_session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) {
    await Workmanager().initialize(gallerySyncCallbackDispatcher);
    await applyGallerySyncSchedule();
  }
  runApp(const CloudityPhotosApp());
}

class CloudityPhotosApp extends StatelessWidget {
  const CloudityPhotosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cloudity Photos',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const _AppBootstrap(),
    );
  }
}

class _AppBootstrap extends StatefulWidget {
  const _AppBootstrap();

  @override
  State<_AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<_AppBootstrap> {
  bool _ready = false;
  UserSession? _session;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final pair = await SessionStore.loadValidatedSession();
    if (!mounted) return;
    setState(() {
      _ready = true;
      if (pair != null) {
        _session = UserSession(
          api: pair.api,
          accessToken: pair.access,
          refreshToken: pair.refresh,
        );
      }
    });
  }

  void _onLoggedIn(UserSession session) {
    setState(() => _session = session);
    if (Platform.isAndroid) {
      resumeGalleryBackupAfterLogin();
    }
  }

  Future<void> _onLogout() async {
    await SessionStore.clearTokens();
    if (!mounted) return;
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final session = _session;
    if (session == null) {
      return LoginScreen(onLoggedIn: _onLoggedIn);
    }
    return TimelineScreen(session: session, onLogout: _onLogout);
  }
}
