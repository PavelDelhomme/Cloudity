import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:cloudity_shared/suite_defaults.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../pass_api.dart';
import '../session_store.dart';
import '../user_session.dart';

class PassLoginScreen extends StatefulWidget {
  const PassLoginScreen({super.key, required this.onLoggedIn});

  final void Function(PassUserSession session) onLoggedIn;

  @override
  State<PassLoginScreen> createState() => _PassLoginScreenState();
}

class _PassLoginScreenState extends State<PassLoginScreen> with WidgetsBindingObserver {
  final _gatewayCtrl = TextEditingController(text: ClouditySuiteDefaults.defaultGatewayEmulator);
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _tenantCtrl = TextEditingController(text: '1');
  String? _error;
  bool _busy = false;
  bool _advancedGateway = false;
  List<CloudityAuthAccount> _brokerAccounts = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    PassSessionStore.gatewayOrDefault().then((url) {
      if (mounted) _gatewayCtrl.text = url;
    });
    PassSessionStore.readUserEmail().then((email) {
      if (mounted && email != null && email.isNotEmpty) {
        _emailCtrl.text = email;
      }
    });
    _refreshBrokerAccounts();
  }

  Future<void> _refreshBrokerAccounts() async {
    final accounts = await CloudityAuthBroker.listAccounts();
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
      final api = PassApi(account.gatewayUrl);
      final pair = await api.ensureValidTokens(
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
      );
      await PassSessionStore.saveSession(
        gatewayUrl: api.baseUrl,
        accessToken: pair.access,
        refreshToken: pair.refresh,
        userId: '',
        userEmail: account.email,
      );
      if (!mounted) return;
      widget.onLoggedIn(PassUserSession(
        api: api,
        accessToken: pair.access,
        refreshToken: pair.refresh,
        userId: '',
        userEmail: account.email,
      ));
    } on PassException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
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
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final gateway = PassSessionStore.hasBuildGateway && !(_advancedGateway && kDebugMode)
          ? await PassSessionStore.gatewayOrDefault()
          : _gatewayCtrl.text.trim();
      final api = PassApi(gateway);
      final tokens = await api.login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        tenantId: _tenantCtrl.text.trim(),
      );
      final access = tokens['access_token']! as String;
      final refresh = (tokens['refresh_token'] as String?) ?? '';
      final userId = (tokens['user_id'] as String?) ?? '';
      await PassSessionStore.saveSession(
        gatewayUrl: gateway,
        accessToken: access,
        refreshToken: refresh,
        userId: userId,
        userEmail: _emailCtrl.text.trim(),
      );
      widget.onLoggedIn(PassUserSession(
        api: api,
        accessToken: access,
        refreshToken: refresh,
        userId: userId,
        userEmail: _emailCtrl.text.trim(),
      ));
    } on PassException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connexion — Cloudity Pass')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Compte Cloudity (le même que sur le web). Le coffre reste verrouillé '
            'tant que vous n\'aurez pas saisi votre mot de passe maître à l\'étape suivante.',
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
            const Divider(height: 24),
          ],
          if (!PassSessionStore.hasBuildGateway || kDebugMode) ...[
            if (kDebugMode && PassSessionStore.hasBuildGateway)
              TextButton(
                onPressed: () => setState(() => _advancedGateway = !_advancedGateway),
                child: Text(_advancedGateway ? 'Masquer les réglages avancés' : 'Réglages avancés'),
              ),
            if (!PassSessionStore.hasBuildGateway || _advancedGateway) ...[
              TextField(
                key: const ValueKey('cloudity_pass_login_gateway'),
                controller: _gatewayCtrl,
                decoration: const InputDecoration(
                  labelText: 'URL gateway',
                  border: OutlineInputBorder(),
                  hintText: 'http://10.0.2.2:6002 (émulateur) ou http://IP_LAN:6002',
                ),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 12),
            ],
          ],
          TextField(
            key: const ValueKey('cloudity_pass_login_email'),
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
            key: const ValueKey('cloudity_pass_login_password'),
            controller: _passwordCtrl,
            decoration: const InputDecoration(
              labelText: 'Mot de passe (compte Cloudity)',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('cloudity_pass_login_tenant'),
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
            key: const ValueKey('cloudity_pass_login_submit'),
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
      ),
    );
  }
}
