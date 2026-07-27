import 'package:cloudity_shared/suite_dev_credentials.dart';
import 'package:cloudity_shared/suite_defaults.dart';
import 'package:cloudity_shared/passkey_login.dart';
import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:cloudity_shared/auth_2fa.dart';
import 'package:cloudity_shared/network_errors.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/auth_api.dart';
import 'session_store.dart';
import 'user_session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});

  final void Function(UserSession session) onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with WidgetsBindingObserver {
  final _gatewayCtrl = TextEditingController(text: ClouditySuiteDefaults.defaultGatewayUsb);
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _tenantCtrl = TextEditingController(text: '1');
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _advancedGateway = false;
  List<CloudityAuthAccount> _brokerAccounts = [];

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  AuthApi? _pendingApi;
  String? _pendingGateway;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (kDebugMode && !SessionStore.hasBuildGateway) {
      _fillLocalDemoAccount();
    }
    SessionStore.gatewayOrDefault().then((url) {
      if (mounted) _gatewayCtrl.text = url;
    });
    _refreshBrokerAccounts();
  }

  Future<void> _refreshBrokerAccounts() async {
    final accounts = await SessionStore.listBrokerAccounts();
    if (mounted) setState(() => _brokerAccounts = accounts);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshBrokerAccounts();
    }
  }

  Future<void> _continueWithBroker(CloudityAuthAccount account) async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final api = AuthApi(account.gatewayUrl);
      if (!await api.authHealth()) {
        throw AuthException('Gateway Cloudity introuvable pour ce compte.');
      }
      final pair = await api
          .ensureValidTokens(
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
          )
          .timeout(const Duration(seconds: 10));
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: api.baseUrl,
        accessToken: pair.access,
        refreshToken: pair.refresh,
        email: account.email,
        tenantId: account.tenantId,
      );
      if (!mounted) return;
      widget.onLoggedIn(
        UserSession(api: api, accessToken: pair.access, refreshToken: pair.refresh),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'reprendre la session'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _gatewayCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _tenantCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _onPasskeyLogin(PasskeyLoginResult result) async {
    try {
      final gateway = _gatewayCtrl.text.trim().isEmpty
          ? await SessionStore.gatewayOrDefault()
          : _gatewayCtrl.text.trim();
      final api = AuthApi(gateway);
      final tenantRaw = _tenantCtrl.text.trim().isEmpty ? '1' : _tenantCtrl.text.trim();
      final tenantId = int.tryParse(tenantRaw) ?? 1;
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: api.baseUrl,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        email: result.email ?? 'passkey@cloudity.local',
        tenantId: tenantId,
      );
      if (!mounted) return;
      widget.onLoggedIn(
        UserSession(
          api: api,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        ),
      );
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'connexion passkey'));
    }
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final email = _emailCtrl.text.trim();
      final password = _passwordCtrl.text;
      final tenant = _tenantCtrl.text.trim().isEmpty ? '1' : _tenantCtrl.text.trim();
      AuthApi? api;
      Map<String, dynamic>? tokens;
      Object? lastReachError;
      for (final gateway in await SessionStore.gatewayCandidates()) {
        final candidate = AuthApi(gateway);
        try {
          if (!await candidate.authHealth()) continue;
        } catch (e) {
          lastReachError = e;
          continue;
        }
        api = candidate;
        try {
          tokens = await candidate.login(email: email, password: password, tenantId: tenant);
        } on LoginRequires2FAException catch (e) {
          if (!mounted) return;
          setState(() {
            _twoFactorRequired = true;
            _pendingEmail = e.email;
            _pendingTenant = e.tenantId;
            _pendingApi = candidate;
            _pendingGateway = gateway;
            _passwordCtrl.clear();
          });
          return;
        }
        break;
      }
      if (api == null || tokens == null) {
        if (lastReachError != null) throw lastReachError;
        throw AuthException('Gateway Cloudity introuvable. Vérifie make up + USB debug.');
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: api.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
        tenantId: int.tryParse(tenant) ?? 1,
      );
      widget.onLoggedIn(UserSession(api: api, accessToken: access, refreshToken: refresh));
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'se connecter'));
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
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: gateway,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        email: email,
        tenantId: int.tryParse(tenant) ?? 1,
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
      setState(() => _error = friendlyNetworkMessage(e, action: 'valider le code 2FA'));
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

  void _fillLocalDemoAccount() {
    setState(() {
      ClouditySuiteDevCredentials.prefill(_emailCtrl, _passwordCtrl);
      _tenantCtrl.text = const String.fromEnvironment('CLOUDITY_DEV_TENANT', defaultValue: '1');
      _gatewayCtrl.text = const String.fromEnvironment(
        'CLOUDITY_DEV_GATEWAY',
        defaultValue: ClouditySuiteDefaults.defaultGatewayUsb,
      );
      _advancedGateway = true;
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
          'Même compte que le tableau de bord web. Le tenant est résolu automatiquement '
          '(tenant 1 en dev local) ; tu n’as qu’à saisir e-mail + mot de passe.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        if (_brokerAccounts.isNotEmpty) ...[
          Text(
            'Compte déjà connecté sur une autre app Cloudity',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          for (final acc in _brokerAccounts)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FilledButton.tonal(
                onPressed: _busy ? null : () => _continueWithBroker(acc),
                child: Text('Continuer avec ${acc.email}'),
              ),
            ),
          const SizedBox(height: 8),
          const Divider(),
          const SizedBox(height: 8),
        ],
        if (kDebugMode) ...[
          OutlinedButton.icon(
            onPressed: _busy ? null : _fillLocalDemoAccount,
            icon: const Icon(Icons.bolt_outlined),
            label: const Text('Utiliser le compte démo local'),
          ),
          const SizedBox(height: 12),
        ],
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
        if (!SessionStore.hasBuildGateway || kDebugMode) ...[
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => setState(() => _advancedGateway = !_advancedGateway),
            child: Text(_advancedGateway ? 'Masquer les réglages avancés' : 'Réglages avancés'),
          ),
          if (_advancedGateway || !SessionStore.hasBuildGateway) ...[
            const SizedBox(height: 8),
            TextField(
              key: const ValueKey('cloudity_photos_login_gateway'),
              controller: _gatewayCtrl,
              decoration: const InputDecoration(
                labelText: 'URL gateway',
                border: OutlineInputBorder(),
                hintText: 'http://192.168.x.x:6002 (LAN) · USB: adb reverse tcp:6002 tcp:6002',
              ),
              keyboardType: TextInputType.url,
            ),
          ],
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 12),
        CloudityPasskeyLoginButton(
          gatewayBase: _gatewayCtrl.text.trim().isEmpty
              ? ClouditySuiteDefaults.defaultGatewayUsb
              : _gatewayCtrl.text.trim(),
          tenantId: _tenantCtrl.text.trim().isEmpty ? '1' : _tenantCtrl.text.trim(),
          busy: _busy,
          onBusyChanged: (v) => setState(() => _busy = v),
          onSuccess: _onPasskeyLogin,
        ),
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
