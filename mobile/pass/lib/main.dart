import 'dart:async';

import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/pass_api.dart';
import 'auth/user_session.dart';
import 'features/vault_controller.dart';
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

  Future<PassUserSession> _toPassSession(CloudityUserSession<PassApi> s) async {
    final email = await SessionStore.readAccountEmail();
    final userId = await SessionStore.readUserId() ?? '';
    return PassUserSession(
      api: s.api,
      accessToken: s.accessToken,
      refreshToken: s.refreshToken,
      userId: userId,
      userEmail: email,
    );
  }

  void _scheduleOta(PassUserSession session) {
    cloudityScheduleOtaCheck(
      context,
      gatewayBase: session.api.baseUrl,
      appSlug: ClouditySuiteApp.pass.otaAppSlug,
    );
  }

  Future<void> _restore() async {
    final loaded =
        await SessionStore.loadValidatedSession(createApi: PassApi.new);
    final email = await SessionStore.readAccountEmail();
    final userId = await SessionStore.readUserId();
    if (!mounted) return;
    setState(() {
      _ready = true;
      if (loaded != null) {
        _session = PassUserSession(
          api: loaded.api,
          accessToken: loaded.access,
          refreshToken: loaded.refresh,
          userId: userId ?? '',
          userEmail: email,
        );
        _bindCrashSession(_session!);
        unawaited(_syncUserPreferences(_session!));
      }
    });
    if (_session != null) _scheduleOta(_session!);
  }

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _onLoggedIn(CloudityUserSession<PassApi> base) async {
    final session = await _toPassSession(base);
    if (!mounted) return;
    _bindCrashSession(session);
    setState(() => _session = session);
    unawaited(_syncUserPreferences(session));
    _scheduleOta(session);
  }

  Future<void> _syncUserPreferences(PassUserSession session) async {
    try {
      final api = UserPreferencesApi(
        gatewayBase: session.api.baseUrl,
        accessToken: session.accessToken,
      );
      await api.syncToCache();
    } catch (_) {
      /* hors ligne — cache local */
    }
  }

  Future<void> _onLogout() async {
    _vault.lock();
    CloudityCrashReporter.clearSession();
    await SessionStore.clearIncludingPassSecrets();
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
      return CloudityLoginScreen<PassApi>(
        suiteApp: ClouditySuiteApp.pass,
        productTitle: 'Cloudity Pass',
        keyPrefix: 'cloudity_pass',
        createApi: PassApi.new,
        onLoggedIn: (s) => unawaited(_onLoggedIn(s)),
      );
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
