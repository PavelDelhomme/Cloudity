import 'dart:async';

import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'session_store.dart';
import 'user_session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});

  final void Function(UserSession session) onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _passwordVisible = false;

  @override
  void initState() {
    super.initState();
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
          'Impossible de joindre Cloudity automatiquement. Vérifiez la stack (make up) et USB debug (make mobile-adb-authorize).',
        );
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      await SessionStore.saveSession(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
      );
      widget.onLoggedIn(UserSession(api: selectedApi, accessToken: access, refreshToken: refresh));
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } on TimeoutException {
      setState(() => _error = 'Connexion timeout. Vérifiez Cloudity (make up) et USB debug.');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _register() async {
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
        tokens = await api.register(email: email, password: password);
        break;
      }
      if (selectedApi == null || tokens == null) {
        throw AuthException('Inscription impossible: gateway Cloudity introuvable.');
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      await SessionStore.saveSession(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
      );
      widget.onLoggedIn(UserSession(api: selectedApi, accessToken: access, refreshToken: refresh));
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } on TimeoutException {
      setState(() => _error = 'Inscription timeout. Vérifiez Cloudity (make up) et USB debug.');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connexion — Cloudity Mail')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Même compte que le web. Entrez e-mail + mot de passe (gateway détectée automatiquement).',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
          ),
          const SizedBox(height: 20),
          TextField(
            key: const ValueKey('cloudity_mail_login_email'),
            controller: _emailCtrl,
            decoration: const InputDecoration(
              labelText: 'E-mail',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('cloudity_mail_login_password'),
            controller: _passwordCtrl,
            decoration: InputDecoration(
              labelText: 'Mot de passe',
              border: OutlineInputBorder(),
              suffixIcon: IconButton(
                tooltip: _passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe',
                onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
                icon: Icon(_passwordVisible ? Icons.visibility_off : Icons.visibility),
              ),
            ),
            obscureText: !_passwordVisible,
            onTapOutside: (_) => FocusScope.of(context).unfocus(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  key: const ValueKey('cloudity_mail_login_submit'),
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Se connecter'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton(
                key: const ValueKey('cloudity_mail_register_submit'),
                onPressed: _busy ? null : _register,
                child: const Text('Créer un compte'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
