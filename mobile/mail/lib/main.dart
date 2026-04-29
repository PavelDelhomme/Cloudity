import 'package:flutter/material.dart';

import 'inbox_screen.dart';
import 'login_screen.dart';
import 'session_store.dart';
import 'user_session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CloudityMailApp());
}

class CloudityMailApp extends StatelessWidget {
  const CloudityMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cloudity Mail',
      themeMode: ThemeMode.dark,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1A73E8),
          brightness: Brightness.dark,
          surface: const Color(0xFF111827),
        ),
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
    return InboxScreen(session: session, onLogout: _onLogout);
  }
}
