import 'dart:async';

import 'package:flutter/material.dart';

import 'auth/hubera_account_prompt.dart';
import 'app_theme.dart';
import 'cloudity_crash_reporter.dart';
import 'cloudity_user_prefs_sync.dart';
import 'ota_update.dart';
import 'suite_app_catalog.dart';

/// Infos session pour la remontée d'erreurs mobile.
class CloudityCrashSessionBinding {
  const CloudityCrashSessionBinding({
    required this.accessToken,
    this.userEmail,
    this.gatewayBase,
  });

  final String accessToken;
  final String? userEmail;
  final String? gatewayBase;
}

/// Bootstrap partagé : restaure la session, affiche login ou l’écran principal.
class SuiteAppShell<S extends Object> extends StatefulWidget {
  const SuiteAppShell({
    super.key,
    required this.restoreSession,
    required this.clearSession,
    required this.loginBuilder,
    required this.homeBuilder,
    this.crashSession,
    this.sessionCredentials,
    this.syncUserPreferences = true,
    this.suiteApp,
    this.enableOtaCheck = true,
    this.restoring,
    this.loginOnlyWithoutSession = false,
  });

  final Future<S?> Function() restoreSession;
  final Future<void> Function() clearSession;
  final Widget Function(void Function(S session) onLoggedIn) loginBuilder;
  final Widget Function(S session, Future<void> Function() onLogout) homeBuilder;
  final CloudityCrashSessionBinding Function(S session)? crashSession;
  /// Extrait gateway + token pour sync préférences compte (thème par app, Pass, …).
  final ClouditySessionCredentials? Function(S session)? sessionCredentials;
  final bool syncUserPreferences;
  /// Produit suite — active le check OTA (`/deploy/mobile/manifest`) si non null.
  final ClouditySuiteApp? suiteApp;
  final bool enableOtaCheck;

  /// Écran pendant la restauration de session. Défaut : indicateur centré.
  /// Photos fournit la bibliothèque déjà en cache pour ne pas figer un écran vide.
  final Widget? restoring;

  /// Défaut faux : les autres apps gardent le sélecteur de compte.
  /// Photos : la connexion n’apparaît que s’il n’y a vraiment pas de session.
  final bool loginOnlyWithoutSession;

  @override
  State<SuiteAppShell<S>> createState() => _SuiteAppShellState<S>();
}

class _SuiteAppShellState<S extends Object> extends State<SuiteAppShell<S>> {
  bool _ready = false;
  S? _session;

  @override
  void initState() {
    super.initState();
    HuberaAccountSwitch.listen(_onChooserRequested);
    _restore();
  }

  void _onChooserRequested() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    HuberaAccountSwitch.unlisten(_onChooserRequested);
    super.dispose();
  }

  void _bindCrashSession(S session) {
    final binding = widget.crashSession?.call(session);
    if (binding == null) return;
    CloudityCrashReporter.setSession(
      accessToken: binding.accessToken,
      userEmail: binding.userEmail,
      gatewayBase: binding.gatewayBase,
    );
  }

  Future<void> _syncPrefs(S session) async {
    if (!widget.syncUserPreferences) return;
    final creds = widget.sessionCredentials?.call(session);
    if (creds == null) return;
    await syncCloudityUserPreferencesQuiet(creds);
    if (!mounted) return;
    await CloudityThemedAppScope.maybeOf(context)?.reloadTheme();
  }

  void _maybeScheduleOta(S session) {
    if (!widget.enableOtaCheck) return;
    final app = widget.suiteApp;
    if (app == null) return;
    final gw = widget.crashSession?.call(session).gatewayBase?.trim() ??
        widget.sessionCredentials?.call(session)?.gatewayBase.trim();
    if (gw == null || gw.isEmpty) return;
    cloudityScheduleOtaCheck(
      context,
      gatewayBase: gw,
      appSlug: app.otaAppSlug,
      huberaHost: app.huberaHost,
    );
  }

  Future<void> _restore() async {
    final session = await widget.restoreSession();
    if (!mounted) return;
    if (session != null) {
      _bindCrashSession(session);
    }
    setState(() {
      _ready = true;
      _session = session;
    });
    if (session != null) {
      unawaited(_syncPrefs(session));
      _maybeScheduleOta(session);
    }
  }

  void _onLoggedIn(S session) {
    HuberaAccountSwitch.openChooser = false;
    _bindCrashSession(session);
    setState(() => _session = session);
    unawaited(_syncPrefs(session));
    _maybeScheduleOta(session);
  }

  Future<void> _onLogout() async {
    CloudityCrashReporter.clearSession();
    await widget.clearSession();
    if (!mounted) return;
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return widget.restoring ??
          const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
    }
    final session = _session;
    final chooser = !widget.loginOnlyWithoutSession && HuberaAccountSwitch.openChooser;
    if (session == null || chooser) {
      return widget.loginBuilder(_onLoggedIn);
    }
    return widget.homeBuilder(session, _onLogout);
  }
}
