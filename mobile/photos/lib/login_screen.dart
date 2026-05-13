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
  final _gatewayCtrl = TextEditingController(text: 'http://10.0.2.2:6080');
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _tenantCtrl = TextEditingController(text: '1');
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _busy = false;

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  AuthApi? _pendingApi;
  String? _pendingGateway;

  @override
  void initState() {
    super.initState();
    SessionStore.gatewayOrDefault().then((url) {
      if (mounted) _gatewayCtrl.text = url;
    });
  }

  @override
  void dispose() {
    _gatewayCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _tenantCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final gateway = _gatewayCtrl.text.trim();
      final api = AuthApi(gateway);
      final tokens = await api.login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        tenantId: _tenantCtrl.text.trim(),
      );
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      await SessionStore.saveSession(
        gatewayUrl: gateway,
        accessToken: access,
        refreshToken: refresh,
      );
      widget.onLoggedIn(UserSession(api: api, accessToken: access, refreshToken: refresh));
    } on LoginRequires2FAException catch (e) {
      if (!mounted) return;
      setState(() {
        _twoFactorRequired = true;
        _pendingEmail = e.email;
        _pendingTenant = e.tenantId;
        _pendingApi = AuthApi(_gatewayCtrl.text.trim());
        _pendingGateway = _gatewayCtrl.text.trim();
        _passwordCtrl.clear();
      });
    } on AuthException catch (e) {
      setState(() => _error = e.message);
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
    final gateway = _pendingGateway;
    if (api == null || email == null || tenant == null || gateway == null) {
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
        gatewayUrl: gateway,
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
      _pendingGateway = null;
      _codeCtrl.clear();
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_twoFactorRequired
            ? 'Vérification 2FA — Cloudity Photos'
            : 'Connexion — Cloudity Photos'),
      ),
      body: _twoFactorRequired ? _build2FAForm(context) : _buildLoginForm(context),
    );
  }

  Widget _buildLoginForm(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Même compte que le tableau de bord web. Les jetons sont stockés de façon sécurisée '
          'avec les clés `cloudity_suite_*` (voir docs/produit/MOBILES.md) pour les futures apps Drive, Mail, etc.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        TextField(
          key: const ValueKey('cloudity_photos_login_gateway'),
          controller: _gatewayCtrl,
          decoration: const InputDecoration(
            labelText: 'URL gateway',
            border: OutlineInputBorder(),
            hintText: 'http://10.0.2.2:6080 ou http://IP_LAN:6080',
          ),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('cloudity_photos_login_email'),
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
          key: const ValueKey('cloudity_photos_login_password'),
          controller: _passwordCtrl,
          decoration: const InputDecoration(
            labelText: 'Mot de passe',
            border: OutlineInputBorder(),
          ),
          obscureText: true,
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('cloudity_photos_login_tenant'),
          controller: _tenantCtrl,
          decoration: const InputDecoration(
            labelText: 'ID tenant',
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.number,
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 20),
        FilledButton(
          key: const ValueKey('cloudity_photos_login_submit'),
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Se connecter'),
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
          key: const ValueKey('cloudity_photos_login_2fa_code'),
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
          key: const ValueKey('cloudity_photos_login_2fa_submit'),
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
          key: const ValueKey('cloudity_photos_login_2fa_cancel'),
          onPressed: _busy ? null : _cancel2FA,
          child: const Text('Annuler / changer de compte'),
        ),
      ],
    );
  }
}
