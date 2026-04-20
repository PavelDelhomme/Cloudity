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
  String? _error;
  bool _busy = false;

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
    } on AuthException catch (e) {
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
      appBar: AppBar(title: const Text('Connexion — Cloudity Drive')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Même compte que le web. Session partagée avec Cloudity Photos (clés cloudity_suite_*).',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54),
          ),
          const SizedBox(height: 20),
          TextField(
            key: const ValueKey('cloudity_drive_login_gateway'),
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
            key: const ValueKey('cloudity_drive_login_email'),
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
            key: const ValueKey('cloudity_drive_login_password'),
            controller: _passwordCtrl,
            decoration: const InputDecoration(
              labelText: 'Mot de passe',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('cloudity_drive_login_tenant'),
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
            key: const ValueKey('cloudity_drive_login_submit'),
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
