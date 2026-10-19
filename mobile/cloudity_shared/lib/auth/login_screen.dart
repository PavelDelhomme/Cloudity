import 'dart:async';

import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_theme.dart';
import '../auth_2fa.dart';
import '../cloudity_design_tokens.dart';
import '../jwt_claims.dart';
import '../network_errors.dart';
import '../passkey_login.dart';
import '../webauthn_client.dart';
import '../suite_app_catalog.dart';
import '../suite_dev_credentials.dart';
import '../ota_update.dart';
import '../suite_gateway_config.dart';
import 'auth_client.dart';
import 'device_account_plan.dart';
import 'hubera_account_order.dart';
import 'hubera_account_prompt.dart';
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
    this.adoptDeviceAccount = false,
  });

  final FutureOr<void> Function(CloudityUserSession<T> session) onLoggedIn;
  final T Function(String gateway) createApi;
  final ClouditySuiteApp suiteApp;
  final String keyPrefix;
  /// Titre complet affiché (« Connexion — Hubera Mail »). Défaut : Hubera + [suiteApp].
  final String? productTitle;
  /// Texte d’intro sous le titre (branding / consignes app).
  final String? supportingText;

  /// Pass uniquement. Défaut false : les autres apps gardent le sélecteur actuel.
  /// Vrai : le compte Hubera ID déjà sur l’appareil est ouvert, ou son adresse
  /// est proposée si le jeton manque. Le scan reste hors du fil UI.
  final bool adoptDeviceAccount;

  String get effectiveProductTitle =>
      productTitle ?? 'Hubera ${suiteApp.title}';

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
  bool _addingAccount = false;
  String? _devicePin;
  List<CloudityAuthAccount> _brokerAccounts = [];

  bool _twoFactorRequired = false;
  String? _pendingEmail;
  String? _pendingTenant;
  T? _pendingApi;
  List<Map<String, dynamic>> _devPersonas = [];
  String? _gatewayBase;
  int _pickGen = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (kDebugMode && widget.suiteApp != ClouditySuiteApp.admin) {
      ClouditySuiteDevCredentials.prefill(_emailCtrl, _passwordCtrl);
      _loadDevPersonas();
    }
    _bootstrapLogin();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshBrokerAccounts();
      unawaited(cloudityResumePendingOtaInstall());
    }
  }

  /// Charge comptes broker (autre app Cloudity) puis reprise auto si un seul compte.
  Future<void> _bootstrapLogin() async {
    if (widget.adoptDeviceAccount && !HuberaAccountSwitch.openChooser) {
      final gateways = await SessionStore.gatewayCandidates();
      if (!mounted) return;
      if (gateways.isNotEmpty) {
        setState(() => _gatewayBase = gateways.first);
      }
      final adopted = await _adoptKnownDeviceAccount();
      if (!mounted || adopted) return;
    }
    final gateways = await SessionStore.gatewayCandidates();
    final accounts = await _orderedBrokerAccounts();
    final idInstalled = await CloudityAuthBroker.isHuberaIdInstalled();
    if (!mounted) return;
    setState(() {
      _brokerAccounts = accounts;
      if (gateways.isNotEmpty) _gatewayBase = gateways.first;
    });
    final admin = widget.suiteApp == ClouditySuiteApp.admin;
    if (admin &&
        adminShouldAutoPasskey(
          chooserRequested: HuberaAccountSwitch.openChooser,
          listedAccounts: accounts.length,
        )) {
      await _tryAutoPasskeyLogin();
      if (!mounted) return;
    }
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    final choice = await promptHuberaAccount(
      context,
      accounts,
      idInstalled: idInstalled,
      deviceEmail: _devicePin,
      prominent: admin,
      barrierDismissible: admin,
    );
    if (!mounted) return;
    if (choice == null) {
      if (HuberaAccountSwitch.openChooser) HuberaAccountSwitch.closeChooser();
      if (!mounted) return;
    }
    if (choice != null && !choice.addNew && choice.account != null) {
      final acc = choice.account!;
      if (acc.accessToken.isNotEmpty || acc.refreshToken.isNotEmpty) {
        await _continueWithBroker(acc);
        return;
      }
      setState(() => _error = widget.suiteApp == ClouditySuiteApp.admin
          ? 'Session absente'
          : 'Session absente pour ce compte. Ajoute-le pour le reconnecter.');
      return;
    }
    setState(() {
      _addingAccount = true;
      _brokerPickerHidden = false;
      _emailCtrl.clear();
      _passwordCtrl.clear();
    });
  }

  /// Ouvre la session déjà sur l’appareil, ou préremplit l’adresse sans jeton.
  /// Retourne false pour laisser le sélecteur historique.
  Future<bool> _adoptKnownDeviceAccount() async {
    final List<CloudityAuthAccount> device;
    try {
      device = await CloudityAuthBroker.listHuberaDeviceAccounts();
    } catch (_) {
      return false;
    }
    if (!mounted || device.isEmpty) return false;
    final withSession = device.where((account) {
      final plan = planDeviceAccount(
        email: account.email,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
      );
      return plan.action == DeviceAccountAction.open;
    }).toList();
    if (withSession.length == 1) {
      await _continueWithBroker(withSession.first);
      return true;
    }
    if (withSession.length > 1) {
      setState(() => _brokerAccounts = withSession);
      final idInstalled = await CloudityAuthBroker.isHuberaIdInstalled();
      if (!mounted) return true;
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return true;
      final choice = await promptHuberaAccount(
        context,
        withSession,
        idInstalled: idInstalled,
        deviceEmail: withSession.first.email,
      );
      if (!mounted) return true;
      if (choice != null && !choice.addNew && choice.account != null) {
        final account = choice.account!;
        final plan = planDeviceAccount(
          email: account.email,
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
        );
        if (plan.action == DeviceAccountAction.open) {
          await _continueWithBroker(account);
          return true;
        }
        _showKnownEmail(account.email);
        return true;
      }
      if (choice != null && choice.addNew) {
        setState(() {
          _addingAccount = true;
          _brokerPickerHidden = false;
          _emailCtrl.clear();
          _passwordCtrl.clear();
        });
      }
      return true;
    }
    CloudityAuthAccount? known;
    for (final account in device) {
      final plan = planDeviceAccount(
        email: account.email,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
      );
      if (plan.fillsEmailField) {
        known = account;
        break;
      }
    }
    if (known == null) return false;
    _showKnownEmail(known.email);
    return true;
  }

  void _showKnownEmail(String email) {
    final address = email.trim();
    if (address.isEmpty) return;
    setState(() {
      _addingAccount = true;
      _brokerPickerHidden = true;
      _emailCtrl.text = address;
      _passwordCtrl.clear();
    });
  }

  /// Le compte déjà sur l’appareil reste premier. Ajouter n’efface pas les autres.
  Future<List<CloudityAuthAccount>> _orderedBrokerAccounts() async {
    var accounts = await SessionStore.listBrokerAccounts();
    if (widget.suiteApp == ClouditySuiteApp.admin) {
      try {
        final device = await CloudityAuthBroker.listHuberaDeviceAccounts();
        accounts = mergeAccountsWithTokens(
          accounts,
          device,
          emailOf: (account) => account.email,
          hasToken: (account) =>
              account.accessToken.trim().isNotEmpty ||
              account.refreshToken.trim().isNotEmpty,
          updatedAtOf: (account) => account.updatedAt,
        );
      } catch (_) {
        // Le sélecteur garde la liste broker si le scan appareil échoue.
      }
    }
    final prefs = await SharedPreferences.getInstance();
    final pin = rememberHuberaDeviceAccount(
      existingPin: prefs.getString(huberaDeviceAccountPinKey),
      emails: accounts.map((a) => a.email).toList(),
      sources: accounts.map((a) => a.sourcePackage).toList(),
      updatedAt: accounts.map((a) => a.updatedAt).toList(),
    );
    if (pin != null && pin.isNotEmpty) {
      await prefs.setString(huberaDeviceAccountPinKey, pin);
    }
    _devicePin = pin;
    return placeHuberaAccountFirst(accounts, pin, (a) => a.email);
  }

  Future<void> _refreshBrokerAccounts() async {
    if (_busy || _twoFactorRequired) return;
    final accounts = await _orderedBrokerAccounts();
    if (!mounted) return;
    setState(() => _brokerAccounts = accounts);
  }

  /// Propose la passkey au démarrage (Credential Manager), comme le web.
  Future<void> _tryAutoPasskeyLogin() async {
    if (!mounted || _busy || _twoFactorRequired) return;
    if (widget.suiteApp != ClouditySuiteApp.admin && _brokerAccounts.isNotEmpty) return;
    if (widget.suiteApp == ClouditySuiteApp.admin &&
        !adminShouldAutoPasskey(
          chooserRequested: HuberaAccountSwitch.openChooser,
          listedAccounts: _brokerAccounts.length,
        )) {
      return;
    }
    final generation = _pickGen;
    final gateway = _gatewayBase;
    if (gateway == null) return;
    final passkeys = CloudityPasskeyLogin(gateway);
    if (!await passkeys.isSupported()) return;
    setState(() => _busy = true);
    try {
      final result = await passkeys.loginDiscoverable();
      if (result != null &&
          result.accessToken.isNotEmpty &&
          mounted &&
          passkeyMayApply(passkeyGeneration: generation, pickGeneration: _pickGen)) {
        await _onPasskeyLoginSuccess(result, generation);
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
    try {
      await widget.onLoggedIn(
        CloudityUserSession<T>(
          api: api,
          accessToken: access,
          refreshToken: refresh,
        ),
      );
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
      rethrow;
    }
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

  Future<void> _onPasskeyLoginSuccess(PasskeyLoginResult result, [int? generation]) async {
    if (result.accessToken.isEmpty) return;
    if (generation != null &&
        !passkeyMayApply(passkeyGeneration: generation, pickGeneration: _pickGen)) {
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final gateways = await SessionStore.gatewayCandidates();
      final gateway = _gatewayBase ?? (gateways.isNotEmpty ? gateways.first : null);
      if (gateway == null) {
        throw AuthException('Gateway Hubera introuvable.');
      }
      final api = widget.createApi(gateway);
      if (!await api.authHealth()) {
        throw AuthException('Gateway Hubera injoignable.');
      }
      if (generation != null &&
          !passkeyMayApply(passkeyGeneration: generation, pickGeneration: _pickGen)) {
        return;
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
    final generation = ++_pickGen;
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      var candidates = await _brokerCandidatesFor(account);
      final triedRefresh = <String>{};
      AuthException? lastAuthError;
      Object? lastOtherError;

      for (var attempt = 0; attempt < 8; attempt++) {
        CloudityAuthAccount? cand;
        for (final c in candidates) {
          if (triedRefresh.add(c.refreshToken)) {
            cand = c;
            break;
          }
        }
        if (cand == null) {
          await Future<void>.delayed(const Duration(milliseconds: 450));
          candidates = await _brokerCandidatesFor(account);
          for (final c in candidates) {
            if (!triedRefresh.contains(c.refreshToken)) {
              triedRefresh.add(c.refreshToken);
              cand = c;
              break;
            }
          }
        }
        if (cand == null) break;

        try {
          // Broker peut encore porter une URL LAN/USB (127.0.0.1:6080) alors
          // que l’APK prod pointe vers api.cloudity.* — essayer les deux.
          final gateways = await _gatewaysForBrokerContinue(cand);
          Object? gatewayError;
          for (final gateway in gateways) {
            try {
              final api = widget.createApi(gateway);
              if (!await api.authHealth()) {
                gatewayError = AuthException(
                  'Gateway Hubera introuvable pour ce compte.',
                );
                continue;
              }
              final pair = await api
                  .ensureValidTokens(
                    accessToken: cand.accessToken,
                    refreshToken: cand.refreshToken,
                  )
                  .timeout(const Duration(seconds: 10));
              if (!passkeyMayApply(
                passkeyGeneration: generation,
                pickGeneration: _pickGen,
              )) {
                return;
              }
              final tokenEmail = emailFromAccessToken(pair.access);
              if (tokenEmail != null &&
                  !sessionMatchesChosenAccount(
                    chosenEmail: account.email,
                    tokenEmail: tokenEmail,
                  )) {
                lastAuthError = AuthException('Session d’un autre compte.');
                break;
              }
              await _finishAuthSuccess(
                api: api,
                access: pair.access,
                refresh: pair.refresh,
                email: account.email.trim().isEmpty ? cand.email : account.email,
              );
              await _refreshBrokerAccounts();
              return;
            } on AuthException catch (e) {
              lastAuthError = e;
              // 401 refresh : inutile de retenter d’autres gateways avec le même jeton.
              if (e.message.toLowerCase().contains('refresh') ||
                  e.message.contains('401')) {
                break;
              }
              gatewayError = e;
            } catch (e) {
              gatewayError = e;
              lastOtherError = e;
            }
          }
          if (gatewayError != null && lastAuthError == null) {
            lastOtherError = gatewayError;
          }
          await Future<void>.delayed(const Duration(milliseconds: 350));
          candidates = await _brokerCandidatesFor(account);
        } on AuthException catch (e) {
          lastAuthError = e;
          await Future<void>.delayed(const Duration(milliseconds: 350));
          candidates = await _brokerCandidatesFor(account);
        } catch (e) {
          lastOtherError = e;
        }
      }

      if (mounted) await _refreshBrokerAccounts();
      if (lastAuthError != null) {
        final msg = lastAuthError.message;
        if (msg.toLowerCase().contains('refresh') || msg.contains('401')) {
          setState(() {
            _error = 'Session expirée — reconnecte-toi (email, mot de passe ou empreinte).';
            _addingAccount = true;
            _brokerPickerHidden = false;
            _emailCtrl.text = account.email;
          });
        } else {
          setState(() => _error = msg);
        }
      } else if (lastOtherError != null) {
        setState(() {
          _error = friendlyNetworkMessage(
            lastOtherError!,
            action: 'reprendre la session',
          );
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Gateways à tenter pour un compte broker (prod dart-define en tête si URL locale).
  Future<List<String>> _gatewaysForBrokerContinue(
    CloudityAuthAccount cand,
  ) async {
    final broker = cand.gatewayUrl.trim().replaceAll(RegExp(r'/$'), '');
    final out = <String>[];
    final seen = <String>{};

    void add(String? raw) {
      final g = (raw ?? '').trim().replaceAll(RegExp(r'/$'), '');
      if (g.isEmpty) return;
      if (seen.add(g)) out.add(g);
    }

    final brokerIsLocal = _isDevOrLoopbackGateway(broker);
    if (SessionStore.hasBuildGateway && brokerIsLocal) {
      add(SuiteGatewayConfig.fromDartDefine);
      add(broker);
    } else {
      add(broker);
      if (SessionStore.hasBuildGateway) add(SuiteGatewayConfig.fromDartDefine);
    }
    for (final g in await SessionStore.gatewayCandidates()) {
      add(g);
    }
    return out;
  }

  bool _isDevOrLoopbackGateway(String gateway) {
    final g = gateway.toLowerCase();
    if (g.isEmpty) return true;
    return g.contains('127.0.0.1') ||
        g.contains('localhost') ||
        g.contains('10.0.2.2') ||
        g.contains('10.0.3.2') ||
        g.contains(':6002') ||
        g.contains(':6080');
  }

  /// Meilleure copie + autres refresh distincts pour le même e-mail.
  Future<List<CloudityAuthAccount>> _brokerCandidatesFor(
    CloudityAuthAccount account,
  ) async {
    final copies = await CloudityAuthBroker.listAllAccountCopies();
    final sameEmail = copies
        .where((a) => a.email.toLowerCase() == account.email.toLowerCase())
        .toList();
    if (sameEmail.isEmpty) return [account];
    // Tri : updated_at desc, puis access encore valide en tête.
    sameEmail.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final out = <CloudityAuthAccount>[];
    final seenRefresh = <String>{};
    for (final a in sameEmail) {
      if (seenRefresh.add(a.refreshToken)) out.add(a);
    }
    // Garantit que le compte tapé est essayé (même si doublon).
    if (seenRefresh.add(account.refreshToken)) {
      out.insert(0, account);
    }
    return out;
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
          'Impossible de joindre Hubera automatiquement. Vérifiez la connexion réseau.',
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
        throw AuthException('Inscription impossible: gateway Hubera introuvable.');
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
    final shell = CloudityLoginScreenShell(
      suiteApp: widget.suiteApp,
      productTitle: widget.effectiveProductTitle,
      supportingText: _twoFactorRequired
          ? 'Code à 6 chiffres (authenticator) ou code de récupération.'
          : widget.supportingText,
      twoFactor: _twoFactorRequired,
      form: _twoFactorRequired ? _build2FAForm(context) : _buildLoginForm(context),
    );
    if (widget.suiteApp != ClouditySuiteApp.admin) return shell;
    final dark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final seed = CloudityDesignTokens.seedColor(widget.suiteApp);
    return Theme(
      data: dark ? CloudityAppThemes.dark(seed) : CloudityAppThemes.light(seed),
      child: shell,
    );
  }

  Widget _buildLoginForm(BuildContext context) {
    final p = widget.keyPrefix;
    final showBrokerPicker = _brokerAccounts.isNotEmpty && !_brokerPickerHidden && !_addingAccount;
    final showCredentials = _brokerAccounts.isEmpty || _addingAccount;
    final admin = widget.suiteApp == ClouditySuiteApp.admin;
    final passkey = _gatewayBase == null
        ? const <Widget>[]
        : <Widget>[
            SizedBox(height: CloudityDesignTokens.spacing('sm')),
            CloudityPasskeyLoginButton(
              gatewayBase: _gatewayBase!,
              busy: _busy,
              onBusyChanged: (v) {
                if (mounted) setState(() => _busy = v);
              },
              onSuccess: _onPasskeyLoginSuccess,
            ),
          ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_busy) ...[
          const LinearProgressIndicator(),
          const SizedBox(height: 12),
          Text(
            'Connexion au compte en cours…',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
        ],
        if (admin) ...passkey,
        if (showBrokerPicker) ...[
          Text(
            'Choisir un compte',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontSize: admin ? 24 : 22,
                  fontWeight: admin ? FontWeight.w600 : FontWeight.w400,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFFE8EAED)
                      : const Color(0xFF202124),
                ),
          ),
          SizedBox(height: admin ? 12 : 4),
          for (final acc in _brokerAccounts)
            HuberaAccountLine(
              title: huberaAccountTitle(acc.email),
              subtitle: acc.email,
              letter: huberaAccountInitial(acc.email),
              colorKey: acc.email,
              onTap: _busy ? null : () => _continueWithBroker(acc),
            ),
          HuberaAccountLine(
            add: true,
            title: 'Ajouter un compte',
            onTap: _busy
                ? null
                : () => setState(() {
                      _addingAccount = true;
                      _brokerPickerHidden = false;
                      _emailCtrl.clear();
                      _passwordCtrl.clear();
                    }),
          ),
        ],
        if (!admin && _gatewayBase != null) ...[
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
        if (showCredentials && kDebugMode && _devPersonas.isNotEmpty)
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
        if (showCredentials && _addingAccount && _brokerAccounts.isNotEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              tooltip: 'Retour',
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _addingAccount = false;
                        _error = null;
                      }),
              icon: const Icon(Icons.arrow_back),
            ),
          ),
        if (showCredentials) TextField(
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
        if (showCredentials) SizedBox(height: CloudityDesignTokens.spacing('md')),
        if (showCredentials) TextField(
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
        if (showCredentials) SizedBox(height: CloudityDesignTokens.spacing('xl')),
        if (showCredentials)
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


