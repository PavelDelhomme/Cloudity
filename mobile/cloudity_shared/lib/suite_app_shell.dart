import 'package:flutter/material.dart';

/// Bootstrap partagé : restaure la session, affiche login ou l’écran principal.
class SuiteAppShell<S extends Object> extends StatefulWidget {
  const SuiteAppShell({
    super.key,
    required this.restoreSession,
    required this.clearSession,
    required this.loginBuilder,
    required this.homeBuilder,
  });

  final Future<S?> Function() restoreSession;
  final Future<void> Function() clearSession;
  final Widget Function(void Function(S session) onLoggedIn) loginBuilder;
  final Widget Function(S session, Future<void> Function() onLogout) homeBuilder;

  @override
  State<SuiteAppShell<S>> createState() => _SuiteAppShellState<S>();
}

class _SuiteAppShellState<S extends Object> extends State<SuiteAppShell<S>> {
  bool _ready = false;
  S? _session;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final session = await widget.restoreSession();
    if (!mounted) return;
    setState(() {
      _ready = true;
      _session = session;
    });
  }

  void _onLoggedIn(S session) {
    setState(() => _session = session);
  }

  Future<void> _onLogout() async {
    await widget.clearSession();
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
      return widget.loginBuilder(_onLoggedIn);
    }
    return widget.homeBuilder(session, _onLogout);
  }
}
