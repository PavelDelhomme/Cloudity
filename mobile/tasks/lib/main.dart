import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'login_screen.dart';
import 'session_store.dart';
import 'user_session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _App());
}

class _App extends StatelessWidget {
  const _App();

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: 'Cloudity Tasks',
      seedColor: Colors.purple,
      home: const _Bootstrap(),
    );
  }
}

class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
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

  Future<void> _onLogout() async {
    await SessionStore.clearTokens();
    if (!mounted) return;
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final session = _session;
    if (session == null) {
      return LoginScreen(onLoggedIn: (s) => setState(() => _session = s));
    }
    return SuiteProductHomeScreen(
      product: SuiteProduct.tasks,
      gatewayBase: session.api.baseUrl,
      accessToken: session.accessToken,
      refreshAccessToken: () async {
        await session.refreshIfNeeded();
        return session.accessToken;
      },
      onLogout: _onLogout,
    );
  }
}
