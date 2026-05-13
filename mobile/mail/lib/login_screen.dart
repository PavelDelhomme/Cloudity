import 'dart:async';

import 'package:cloudity_shared/auth_2fa.dart';
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
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _passwordVisible = false;

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  AuthApi? _pendingApi;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _codeCtrl.dispose();
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
        try {
          tokens = await api.login(email: email, password: password);
        } on LoginRequires2FAException catch (e) {
          if (!mounted) return;
          setState(() {
            _twoFactorRequired = true;
            _pendingEmail = e.email;
            _pendingTenant = e.tenantId;
            _pendingApi = api;
            _passwordCtrl.clear();
          });
          return;
        }
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

  Future<void> _submit2FA() async {
    final api = _pendingApi;
    final email = _pendingEmail;
    final tenant = _pendingTenant;
    if (api == null || email == null || tenant == null) {
      setState(() => _error = 'Session 2FA perdue, recommencez.');
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final res = await api.verify2FA(
        email: email,
        tenantId: tenant,
        code: _codeCtrl.text,
      );
      await SessionStore.saveSession(
        gatewayUrl: api.baseUrl,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      );
      if (!mounted) return;
      widget.onLoggedIn(UserSession(
        api: api,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      ));
    } on Auth2FAException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _cancel2FA() {
    setState(() {
      _twoFactorRequired = false;
      _pendingEmail = null;
      _pendingTenant = null;
      _pendingApi = null;
      _codeCtrl.clear();
      _error = null;
    });
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
      appBar: AppBar(
        title: Text(_twoFactorRequired
            ? 'Vérification 2FA — Cloudity Mail'
            : 'Connexion — Cloudity Mail'),
      ),
      body: _twoFactorRequired ? _build2FAForm(context) : _buildLoginForm(context),
    );
  }

  Widget _buildLoginForm(BuildContext context) {
    return ListView(
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
            border: const OutlineInputBorder(),
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
    );
  }

  Widget _build2FAForm(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Saisis le code à 6 chiffres de ton authenticator (TOTP) ou un code de '
          'récupération de 12 caractères.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black87),
        ),
        const SizedBox(height: 20),
        TextField(
          key: const ValueKey('cloudity_mail_login_2fa_code'),
          controller: _codeCtrl,
          decoration: const InputDecoration(
            labelText: 'Code 2FA',
            border: OutlineInputBorder(),
            hintText: '123456 ou ABCD-1234-EFGH',
          ),
          keyboardType: TextInputType.visiblePassword,
          autocorrect: false,
          enableSuggestions: false,
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 20),
        FilledButton(
          key: const ValueKey('cloudity_mail_login_2fa_submit'),
          onPressed: _busy ? null : _submit2FA,
          child: _busy
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Valider'),
        ),
        const SizedBox(height: 12),
        TextButton(
          key: const ValueKey('cloudity_mail_login_2fa_cancel'),
          onPressed: _busy ? null : _cancel2FA,
          child: const Text('Annuler / changer de compte'),
        ),
      ],
    );
  }
}
