import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../auth_2fa.dart';
import '../network_errors.dart';
import '../suite_dev_credentials.dart';
import 'auth_client.dart';
import 'session_store.dart';
import 'user_session.dart';

/// Écran de connexion unique (H19) — titres / clés sémantiques paramétrables.
class CloudityLoginScreen<T extends CloudityAuthClient> extends StatefulWidget {
  const CloudityLoginScreen({
    super.key,
    required this.onLoggedIn,
    required this.createApi,
    required this.productTitle,
    required this.keyPrefix,
    this.supportingText,
  });

  final void Function(CloudityUserSession<T> session) onLoggedIn;
  final T Function(String gateway) createApi;
  final String productTitle;
  final String keyPrefix;
  /// Texte d’intro sous le titre (branding / consignes app).
  final String? supportingText;

  @override
  State<CloudityLoginScreen<T>> createState() => _CloudityLoginScreenState<T>();
}

class _CloudityLoginScreenState<T extends CloudityAuthClient>
    extends State<CloudityLoginScreen<T>> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _passwordVisible = false;
  List<CloudityAuthAccount> _brokerAccounts = [];

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  T? _pendingApi;
  List<Map<String, dynamic>> _devPersonas = [];

  @override
  void initState() {
    super.initState();
    SessionStore.listBrokerAccounts().then((accounts) {
      if (mounted) setState(() => _brokerAccounts = accounts);
    });
    if (kDebugMode) {
      ClouditySuiteDevCredentials.prefill(_emailCtrl, _passwordCtrl);
      _loadDevPersonas();
    }
  }

  Future<void> _loadDevPersonas() async {
    try {
      final gateways = await SessionStore.gatewayCandidates();
      for (final gateway in gateways) {
        final api = widget.createApi(gateway);
        final personas = await api.fetchDevQuickLoginPersonas();
        if (personas != null && personas.isNotEmpty) {
          if (mounted) setState(() => _devPersonas = personas);
          return;
        }
      }
    } catch (_) {
      // silencieux — panneau masqué
    }
  }

  Future<void> _devQuickLogin(Map<String, dynamic> persona) async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final personaId = persona['id']?.toString() ?? '';
      T? selectedApi;
      Map<String, dynamic>? tokens;
      Object? lastReachError;
      final gateways = await SessionStore.gatewayCandidates();
      for (final gateway in gateways) {
        final api = widget.createApi(gateway);
        try {
          if (!await api.authHealth()) continue;
        } catch (e) {
          lastReachError = e;
          continue;
        }
        selectedApi = api;
        tokens = await api.devQuickLogin(persona: personaId);
        break;
      }
      if (selectedApi == null || tokens == null) {
        if (lastReachError != null) throw lastReachError;
        throw AuthException(
          'Connexion rapide indisponible. make up + make seed-dev-users + auth-service redémarré ?',
        );
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      final email = (tokens['email'] as String?) ??
          persona['email']?.toString() ??
          '';
      final userId = tokens['user_id']?.toString();
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
        userId: userId,
      );
      widget.onLoggedIn(
        CloudityUserSession<T>(
          api: selectedApi,
          accessToken: access,
          refreshToken: refresh,
        ),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'connexion rapide'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _continueWithBroker(CloudityAuthAccount account) async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final api = widget.createApi(account.gatewayUrl);
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
        CloudityUserSession<T>(
          api: api,
          accessToken: pair.access,
          refreshToken: pair.refresh,
        ),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'reprendre la session'));
    } finally {
      if (mounted) setState(() => _busy = false);
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
      T? selectedApi;
      Map<String, dynamic>? tokens;
      Object? lastReachError;
      final gateways = await SessionStore.gatewayCandidates();
      for (final gateway in gateways) {
        final api = widget.createApi(gateway);
        try {
          if (!await api.authHealth()) continue;
        } catch (e) {
          lastReachError = e;
          continue;
        }
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
        if (lastReachError != null) throw lastReachError;
        throw AuthException(
          'Impossible de joindre Cloudity automatiquement. Vérifiez la stack (make up) et USB debug (make mobile-adb-authorize).',
        );
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      final userId = tokens['user_id']?.toString();
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
        userId: userId,
      );
      widget.onLoggedIn(
        CloudityUserSession<T>(
          api: selectedApi,
          accessToken: access,
          refreshToken: refresh,
        ),
      );
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
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: api.baseUrl,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        email: email,
        tenantId: int.tryParse(tenant) ?? 1,
      );
      if (!mounted) return;
      widget.onLoggedIn(
        CloudityUserSession<T>(
          api: api,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        ),
      );
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
      T? selectedApi;
      Map<String, dynamic>? tokens;
      Object? lastReachError;
      final gateways = await SessionStore.gatewayCandidates();
      for (final gateway in gateways) {
        final api = widget.createApi(gateway);
        try {
          if (!await api.authHealth()) continue;
        } catch (e) {
          lastReachError = e;
          continue;
        }
        selectedApi = api;
        tokens = await api.register(email: email, password: password);
        break;
      }
      if (selectedApi == null || tokens == null) {
        if (lastReachError != null) throw lastReachError;
        throw AuthException('Inscription impossible: gateway Cloudity introuvable.');
      }
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      final userId = tokens['user_id']?.toString();
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: selectedApi.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
        userId: userId,
      );
      widget.onLoggedIn(
        CloudityUserSession<T>(
          api: selectedApi,
          accessToken: access,
          refreshToken: refresh,
        ),
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'créer le compte'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_twoFactorRequired
            ? 'Vérification 2FA — ${widget.productTitle}'
            : 'Connexion — ${widget.productTitle}'),
      ),
      body: _twoFactorRequired ? _build2FAForm(context) : _buildLoginForm(context),
    );
  }

  Widget _buildLoginForm(BuildContext context) {
    final p = widget.keyPrefix;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          widget.supportingText ??
              'Même compte que le web. Entrez e-mail + mot de passe (gateway détectée automatiquement).',
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
        if (kDebugMode && _devPersonas.isNotEmpty) ...[
          Text(
            'Dev — connexion rapide',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 4),
          Text(
            'Sans mot de passe (local uniquement)',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          for (final p in _devPersonas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FilledButton.tonal(
                key: ValueKey('${widget.keyPrefix}_dev_quick_${p['id']}'),
                onPressed: _busy ? null : () => _devQuickLogin(p),
                child: Text(
                  '${p['label'] ?? p['id']} — ${p['email'] ?? ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          const SizedBox(height: 8),
          const Divider(),
          const SizedBox(height: 8),
        ],
        TextField(
          key: ValueKey('${p}_login_email'),
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
          key: ValueKey('${p}_login_password'),
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
                key: ValueKey('${p}_login_submit'),
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
              key: ValueKey('${p}_register_submit'),
              onPressed: _busy ? null : _register,
              child: const Text('Créer un compte'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _build2FAForm(BuildContext context) {
    final p = widget.keyPrefix;
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
          key: ValueKey('${p}_login_2fa_code'),
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
          key: ValueKey('${p}_login_2fa_submit'),
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
          key: ValueKey('${p}_login_2fa_cancel'),
          onPressed: _busy ? null : _cancel2FA,
          child: const Text('Annuler / changer de compte'),
        ),
      ],
    );
  }
}
