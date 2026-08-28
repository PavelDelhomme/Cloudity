import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth_2fa.dart';
import '../cloudity_design_tokens.dart';
import '../jwt_claims.dart';
import '../network_errors.dart';
import '../passkey_login.dart';
import '../webauthn_client.dart';
import '../suite_app_catalog.dart';
import '../suite_dev_credentials.dart';
import 'auth_client.dart';
import 'login_screen_shell.dart';
import 'session_store.dart';
import 'user_session.dart';

const _passkeyOfferPrefix = 'cloudity_passkey_offer_';

/// Écran de connexion unique (H19) — branding par app, structure commune.
class CloudityLoginScreen<T extends CloudityAuthClient> extends StatefulWidget {
  const CloudityLoginScreen({
    super.key,
    required this.onLoggedIn,
    required this.createApi,
    required this.suiteApp,
    required this.keyPrefix,
    this.productTitle,
    this.supportingText,
  });

  final void Function(CloudityUserSession<T> session) onLoggedIn;
  final T Function(String gateway) createApi;
  final ClouditySuiteApp suiteApp;
  final String keyPrefix;
  /// Titre complet affiché (« Connexion — Cloudity Mail »). Défaut : Cloudity + [suiteApp].
  final String? productTitle;
  /// Texte d’intro sous le titre (branding / consignes app).
  final String? supportingText;

  String get effectiveProductTitle =>
      productTitle ?? 'Cloudity ${suiteApp.title}';

  @override
  State<CloudityLoginScreen<T>> createState() => _CloudityLoginScreenState<T>();
}

class _CloudityLoginScreenState<T extends CloudityAuthClient>
    extends State<CloudityLoginScreen<T>> with WidgetsBindingObserver {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _passwordVisible = false;
  bool _brokerPickerHidden = false;
  List<CloudityAuthAccount> _brokerAccounts = [];

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  T? _pendingApi;
  List<Map<String, dynamic>> _devPersonas = [];
  String? _gatewayBase;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (kDebugMode) {
      ClouditySuiteDevCredentials.prefill(_emailCtrl, _passwordCtrl);
      _loadDevPersonas();
    }
    _bootstrapLogin();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshBrokerAccounts();
    }
  }

  /// Charge comptes broker (autre app Cloudity) puis reprise auto si un seul compte.
  Future<void> _bootstrapLogin() async {
    final gateways = await SessionStore.gatewayCandidates();
    final accounts = await SessionStore.listBrokerAccounts();
    if (!mounted) return;
    setState(() {
      _brokerAccounts = accounts;
      if (gateways.isNotEmpty) _gatewayBase = gateways.first;
    });
    if (accounts.length == 1 && !_brokerPickerHidden) {
      await _continueWithBroker(accounts.first);
      return;
    }
    if (accounts.isEmpty) {
      await _tryAutoPasskeyLogin();
    }
  }

  Future<void> _refreshBrokerAccounts() async {
    if (_busy || _twoFactorRequired) return;
    final accounts = await SessionStore.listBrokerAccounts();
    if (!mounted) return;
    setState(() => _brokerAccounts = accounts);
  }

  /// Propose la passkey au démarrage (Credential Manager), comme le web.
  Future<void> _tryAutoPasskeyLogin() async {
    if (!mounted || _busy || _twoFactorRequired || _brokerAccounts.isNotEmpty) return;
    final gateway = _gatewayBase;
    if (gateway == null) return;
    final passkeys = CloudityPasskeyLogin(gateway);
    if (!await passkeys.isSupported()) return;
    setState(() => _busy = true);
    try {
      final result = await passkeys.loginDiscoverable();
      if (result != null && result.accessToken.isNotEmpty && mounted) {
        await _onPasskeyLoginSuccess(result);
      }
    } catch (_) {
      // Annulation utilisateur ou aucune passkey — formulaire email/mot de passe.
    } finally {
      if (mounted) setState(() => _busy = false);
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
      await _finishAuthSuccess(
        api: selectedApi,
        access: access,
        refresh: refresh,
        email: email,
        userId: userId,
        tokens: tokens,
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'connexion rapide'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finishAuthSuccess({
    required T api,
    required String access,
    required String refresh,
    required String email,
    String? userId,
    Map<String, dynamic>? tokens,
    bool offerPasskey = false,
  }) async {
    await SessionStore.saveSessionWithEmail(
      gatewayUrl: api.baseUrl,
      accessToken: access,
      refreshToken: refresh,
      email: email,
      userId: userId,
      tenantId: _tenantFromAuth(access, tokens),
    );
    if (offerPasskey && mounted) {
      await _maybeOfferPasskeyRegistration(
        gatewayUrl: api.baseUrl,
        accessToken: access,
        email: email,
      );
    }
    if (!mounted) return;
    widget.onLoggedIn(
      CloudityUserSession<T>(
        api: api,
        accessToken: access,
        refreshToken: refresh,
      ),
    );
  }

  Future<void> _maybeOfferPasskeyRegistration({
    required String gatewayUrl,
    required String accessToken,
    required String email,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_passkeyOfferPrefix${email.toLowerCase()}';
    if (prefs.getBool(key) == true) return;

    final passkeys = CloudityPasskeyLogin(gatewayUrl);
    if (!await passkeys.isSupported()) {
      await prefs.setBool(key, true);
      return;
    }

    final accept = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.fingerprint, size: 36),
        title: const Text('Connexion par empreinte'),
        content: Text(
          'Enregistrer une passkey pour te connecter plus vite la prochaine fois '
          '($email) ?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Plus tard'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Activer'),
          ),
        ],
      ),
    );

    await prefs.setBool(key, true);
    if (accept != true || !mounted) return;

    try {
      await passkeys.registerPasskey(
        accessToken: accessToken,
        nickname: widget.suiteApp.title,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Passkey enregistrée — utilise « Connexion empreinte » la prochaine fois.'),
          ),
        );
      }
    } on CloudityWebAuthnException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (_) {
      // silencieux — l'utilisateur pourra réessayer depuis le web
    }
  }

  Future<void> _onPasskeyLoginSuccess(PasskeyLoginResult result) async {
    if (result.accessToken.isEmpty) return;
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final gateways = await SessionStore.gatewayCandidates();
      final gateway = _gatewayBase ?? (gateways.isNotEmpty ? gateways.first : null);
      if (gateway == null) {
        throw AuthException('Gateway Cloudity introuvable.');
      }
      final api = widget.createApi(gateway);
      if (!await api.authHealth()) {
        throw AuthException('Gateway Cloudity injoignable.');
      }
      final email = result.email ?? _emailCtrl.text.trim();
      await _finishAuthSuccess(
        api: api,
        access: result.accessToken,
        refresh: result.refreshToken,
        email: email.isNotEmpty ? email : 'compte@cloudity',
        userId: result.userId,
        tokens: result.rawTokens,
      );
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = friendlyNetworkMessage(e, action: 'connexion passkey'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
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
      await _finishAuthSuccess(
        api: api,
        access: pair.access,
        refresh: pair.refresh,
        email: account.email,
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
      await _finishAuthSuccess(
        api: selectedApi,
        access: access,
        refresh: refresh,
        email: email,
        userId: userId,
        tokens: tokens,
        offerPasskey: true,
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
    if (api == null || email == null) {
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
      await _finishAuthSuccess(
        api: api,
        access: res.accessToken,
        refresh: res.refreshToken,
        email: email,
        offerPasskey: true,
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

  int _tenantFromAuth(String access, Map<String, dynamic>? tokens) {
    final fromApi = tokens?['tenant_id']?.toString();
    if (fromApi != null && fromApi.isNotEmpty) {
      return int.tryParse(fromApi) ?? 1;
    }
    return tenantIdFromAccessToken(access) ?? 1;
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
      await _finishAuthSuccess(
        api: selectedApi,
        access: access,
        refresh: refresh,
        email: email,
        userId: userId,
        tokens: tokens,
        offerPasskey: true,
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
    return CloudityLoginScreenShell(
      suiteApp: widget.suiteApp,
      productTitle: widget.effectiveProductTitle,
      supportingText: _twoFactorRequired
          ? 'Saisis le code à 6 chiffres de ton authenticator (TOTP) ou un code de '
              'récupération de 12 caractères.'
          : (widget.supportingText ??
              'Même compte que sur le web. La gateway est détectée automatiquement.'),
      twoFactor: _twoFactorRequired,
      form: _twoFactorRequired ? _build2FAForm(context) : _buildLoginForm(context),
    );
  }

  Widget _buildLoginForm(BuildContext context) {
    final p = widget.keyPrefix;
    final showBrokerPicker = _brokerAccounts.isNotEmpty && !_brokerPickerHidden;
    final showAltMethods = showBrokerPicker || _gatewayBase != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showBrokerPicker) ...[
          Text(
            'Continuer avec un compte Cloudity',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          SizedBox(height: CloudityDesignTokens.spacing('sm')),
          for (final acc in _brokerAccounts)
            _BrokerAccountTile(
              email: acc.email,
              sourcePackage: acc.sourcePackage,
              onTap: _busy ? null : () => _continueWithBroker(acc),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _brokerPickerHidden = true;
                        _emailCtrl.clear();
                        _passwordCtrl.clear();
                      }),
              child: const Text('Utiliser un autre compte'),
            ),
          ),
        ],
        if (_gatewayBase != null) ...[
          SizedBox(height: CloudityDesignTokens.spacing('sm')),
          CloudityPasskeyLoginButton(
            gatewayBase: _gatewayBase!,
            busy: _busy,
            onBusyChanged: (v) {
              if (mounted) setState(() => _busy = v);
            },
            onSuccess: _onPasskeyLoginSuccess,
          ),
        ],
        if (showAltMethods) ...[
          Padding(
            padding: EdgeInsets.symmetric(vertical: CloudityDesignTokens.spacing('md')),
            child: Row(
              children: [
                const Expanded(child: Divider()),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    'ou avec e-mail',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                const Expanded(child: Divider()),
              ],
            ),
          ),
        ],
        if (kDebugMode && _devPersonas.isNotEmpty)
          CloudityLoginExtraPanel(
            title: 'Dev — connexion rapide',
            subtitle: 'Sans mot de passe (local uniquement)',
            children: [
              for (final persona in _devPersonas)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: FilledButton.tonal(
                    key: ValueKey('${widget.keyPrefix}_dev_quick_${persona['id']}'),
                    onPressed: _busy ? null : () => _devQuickLogin(persona),
                    child: Text(
                      '${persona['label'] ?? persona['id']} — ${persona['email'] ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
            ],
          ),
        TextField(
          key: ValueKey('${p}_login_email'),
          controller: _emailCtrl,
          decoration: const InputDecoration(
            labelText: 'E-mail',
            prefixIcon: Icon(Icons.alternate_email_outlined, size: 22),
          ),
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          textInputAction: TextInputAction.next,
        ),
        SizedBox(height: CloudityDesignTokens.spacing('md')),
        TextField(
          key: ValueKey('${p}_login_password'),
          controller: _passwordCtrl,
          decoration: InputDecoration(
            labelText: 'Mot de passe',
            prefixIcon: const Icon(Icons.lock_outline, size: 22),
            suffixIcon: IconButton(
              tooltip: _passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe',
              onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
              icon: Icon(_passwordVisible ? Icons.visibility_off : Icons.visibility),
            ),
          ),
          obscureText: !_passwordVisible,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!_busy) _submit();
          },
          onTapOutside: (_) => FocusScope.of(context).unfocus(),
        ),
        if (_error != null) ...[
          SizedBox(height: CloudityDesignTokens.spacing('md')),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('sm')),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.error_outline, size: 20, color: Theme.of(context).colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
                  ),
                ),
              ],
            ),
          ),
        ],
        SizedBox(height: CloudityDesignTokens.spacing('xl')),
        CloudityLoginActions(
          primaryKey: ValueKey('${p}_login_submit'),
          primaryLabel: 'Se connecter',
          onPrimary: _submit,
          busy: _busy,
          secondaryKey: ValueKey('${p}_register_submit'),
          secondaryLabel: 'Créer un compte',
          onSecondary: _register,
        ),
      ],
    );
  }

  Widget _build2FAForm(BuildContext context) {
    final p = widget.keyPrefix;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: ValueKey('${p}_login_2fa_code'),
          controller: _codeCtrl,
          decoration: const InputDecoration(
            labelText: 'Code 2FA',
            prefixIcon: Icon(Icons.pin_outlined, size: 22),
            hintText: '123456 ou ABCD-1234-EFGH',
          ),
          keyboardType: TextInputType.visiblePassword,
          autocorrect: false,
          enableSuggestions: false,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!_busy) _submit2FA();
          },
        ),
        if (_error != null) ...[
          SizedBox(height: CloudityDesignTokens.spacing('md')),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        SizedBox(height: CloudityDesignTokens.spacing('xl')),
        CloudityLoginActions(
          primaryKey: ValueKey('${p}_login_2fa_submit'),
          primaryLabel: 'Valider',
          onPrimary: _submit2FA,
          busy: _busy,
          secondaryKey: ValueKey('${p}_login_2fa_cancel'),
          secondaryLabel: 'Annuler / changer de compte',
          onSecondary: _cancel2FA,
        ),
      ],
    );
  }
}

class _BrokerAccountTile extends StatelessWidget {
  const _BrokerAccountTile({
    required this.email,
    this.sourcePackage,
    required this.onTap,
  });

  final String email;
  final String? sourcePackage;
  final VoidCallback? onTap;

  String get _initial {
    final local = email.split('@').first.trim();
    if (local.isEmpty) return '?';
    return local[0].toUpperCase();
  }

  String? get _sourceLabel {
    final pkg = sourcePackage;
    if (pkg == null || pkg.isEmpty) return null;
    const labels = {
      'fr.cloudity.cloudity_mail': 'Mail',
      'fr.cloudity.cloudity_drive': 'Drive',
      'fr.cloudity.cloudity_photos': 'Photos',
      'com.cloudity.cloudity_pass': 'Pass',
      'fr.cloudity.cloudity_calendar': 'Calendar',
      'fr.cloudity.cloudity_contacts': 'Contacts',
      'fr.cloudity.cloudity_notes': 'Notes',
      'fr.cloudity.cloudity_tasks': 'Tasks',
      'fr.cloudity.admin_app': 'Admin',
    };
    return labels[pkg];
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: cs.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('md')),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: cs.primaryContainer,
                  child: Text(
                    _initial,
                    style: TextStyle(
                      color: cs.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                      Text(
                        _sourceLabel != null
                            ? 'Connecté sur Cloudity $_sourceLabel'
                            : 'Compte Cloudity — appuyer pour continuer',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: cs.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

