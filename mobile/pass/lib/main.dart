import 'package:flutter/material.dart';

import 'package:cloudity_shared/app_theme.dart';

import 'screens/login_screen.dart';
import 'screens/unlock_screen.dart';
import 'screens/vaults_screen.dart';
import 'session_store.dart';
import 'user_session.dart';
import 'vault_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _PassRoot());
}

class _PassRoot extends StatefulWidget {
  const _PassRoot();

  @override
  State<_PassRoot> createState() => _PassRootState();
}

class _PassRootState extends State<_PassRoot> {
  final VaultController _vault = VaultController();

  @override
  void dispose() {
    _vault.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: 'Cloudity Pass',
      seedColor: Colors.deepPurple,
      home: _AppBootstrap(vault: _vault),
    );
  }
}

class _AppBootstrap extends StatefulWidget {
  const _AppBootstrap({required this.vault});

  final VaultController vault;

  @override
  State<_AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<_AppBootstrap> {
  bool _ready = false;
  PassUserSession? _session;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final loaded = await PassSessionStore.loadValidatedSession();
    final email = await PassSessionStore.readUserEmail();
    if (!mounted) return;
    setState(() {
      _ready = true;
      if (loaded != null) {
        _session = PassUserSession(
          api: loaded.api,
          accessToken: loaded.access,
          refreshToken: loaded.refresh,
          userId: loaded.userId ?? '',
          userEmail: email,
        );
      }
    });
  }

  void _onLoggedIn(PassUserSession session) {
    setState(() => _session = session);
  }

  Future<void> _onLogout() async {
    widget.vault.lock();
    await PassSessionStore.clearAll();
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
      return PassLoginScreen(onLoggedIn: _onLoggedIn);
    }
    return AnimatedBuilder(
      animation: widget.vault,
      builder: (context, _) {
        if (!widget.vault.isUnlocked) {
          return PassUnlockScreen(
            session: session,
            controller: widget.vault,
            onLogout: _onLogout,
          );
        }
        return PassVaultsScreen(
          session: session,
          controller: widget.vault,
          onLogout: _onLogout,
        );
      },
    );
  }
}
