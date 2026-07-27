import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import '../api/auth_api.dart';
import 'session_store.dart';
import 'user_session.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key, required this.onLoggedIn});

  final void Function(UserSession session) onLoggedIn;

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (kDebugMode) {
      ClouditySuiteDevCredentials.prefill(_emailCtrl, _passwordCtrl);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final email = _emailCtrl.text.trim();
      final password = _passwordCtrl.text;
      AuthApi? selectedApi;
      Map<String, dynamic>? tokens;
      final gateways = await SessionStore.gatewayCandidates();
      for (final gateway in gateways) {
        final api = AuthApi(gateway);
        if (!await api.authHealth()) continue;
        selectedApi = api;
        tokens = await api.login(email: email, password: password);
        break;
      }
      if (selectedApi == null || tokens == null) {
        throw AuthException(
          'Gateway Cloudity introuvable. Lancez make up et vérifiez CLOUDITY_MOBILE_GATEWAY_URL.',
        );
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      final me = await selectedApi.fetchMe(access);
      final role = (me['role'] ?? me['user']?['role'])?.toString().toLowerCase();
      if (role != 'admin') {
        throw AuthException('Compte non administrateur (rôle: ${role ?? 'user'}).');
      }
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
      );
      if (!mounted) return;
      widget.onLoggedIn(
        UserSession(api: selectedApi, accessToken: access, refreshToken: refresh),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'se connecter'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Cloudity Admin',
                    style: Theme.of(context).textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Connexion administrateur via l’api-gateway (:6002 en local, HTTPS en prod).',
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _emailCtrl,
                    decoration: const InputDecoration(
                      labelText: 'E-mail admin',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwordCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Mot de passe',
                      border: OutlineInputBorder(),
                    ),
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _busy ? null : _submit(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Se connecter'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
