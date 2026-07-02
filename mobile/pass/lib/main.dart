import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/session_store.dart';
import 'auth/user_session.dart';
import 'features/vault_controller.dart';
import 'screens/login_screen.dart';
import 'screens/unlock_screen.dart';
import 'screens/vaults_screen.dart';

Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.pass,
    title: 'Cloudity Pass',
    home: const _PassRoot(),
  );
}

class _PassRoot extends StatefulWidget {
  const _PassRoot();

  @override
  State<_PassRoot> createState() => _PassRootState();
}

class _PassRootState extends State<_PassRoot> {
  final VaultController _vault = VaultController();
  bool _ready = false;
  PassUserSession? _session;

  @override
  void dispose() {
    _vault.dispose();
    super.dispose();
  }

  void _bindCrashSession(PassUserSession session) {
    CloudityCrashReporter.setSession(
      accessToken: session.accessToken,
      userEmail: session.userEmail,
      gatewayBase: session.api.baseUrl,
    );
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
        _bindCrashSession(_session!);
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _restore();
  }

  void _onLoggedIn(PassUserSession session) {
    _bindCrashSession(session);
    setState(() => _session = session);
  }

  Future<void> _onLogout() async {
    _vault.lock();
    CloudityCrashReporter.clearSession();
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
      animation: _vault,
      builder: (context, _) {
        if (!_vault.isUnlocked) {
          return PassUnlockScreen(
            session: session,
            controller: _vault,
            onLogout: _onLogout,
          );
        }
        return PassVaultsScreen(
          session: session,
          controller: _vault,
          onLogout: _onLogout,
        );
      },
    );
  }
}
