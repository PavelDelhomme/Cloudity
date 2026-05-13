import 'package:flutter/material.dart';

import '../pass_crypto.dart';
import '../user_session.dart';
import '../vault_controller.dart';

class PassUnlockScreen extends StatefulWidget {
  const PassUnlockScreen({
    super.key,
    required this.session,
    required this.controller,
    required this.onLogout,
  });

  final PassUserSession session;
  final VaultController controller;
  final VoidCallback onLogout;

  @override
  State<PassUnlockScreen> createState() => _PassUnlockScreenState();
}

class _PassUnlockScreenState extends State<PassUnlockScreen> {
  final _passwordCtrl = TextEditingController();
  Argon2idParams _params = Argon2idParams.mobileLow;
  bool _busy = false;
  String? _error;

  static const _profileChoices = <(String, Argon2idParams)>[
    ('Mobile (rapide)', Argon2idParams.mobileLow),
    ('Mobile haut-de-gamme', Argon2idParams.mobileHigh),
    ('Desktop (compatible web)', Argon2idParams.desktop),
  ];

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.controller.unlock(
        masterPassword: _passwordCtrl.text,
        userId: widget.session.userId,
        params: _params,
      );
      if (!mounted) return;
      if (widget.controller.unlockError != null) {
        setState(() => _error = widget.controller.unlockError);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Déverrouiller le coffre'),
        actions: [
          IconButton(
            tooltip: 'Se déconnecter du compte',
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (widget.session.userEmail != null && widget.session.userEmail!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Compte : ${widget.session.userEmail}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          Text(
            'Saisissez votre **mot de passe maître** Cloudity Pass. Il dérive '
            'localement la clé qui déchiffre le coffre — il n\'est jamais envoyé '
            'au serveur.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54),
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('cloudity_pass_unlock_password'),
            controller: _passwordCtrl,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Mot de passe maître',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) => _busy ? null : _unlock(),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<Argon2idParams>(
            initialValue: _params,
            decoration: const InputDecoration(
              labelText: 'Profil Argon2id (doit correspondre au profil web)',
              border: OutlineInputBorder(),
            ),
            items: _profileChoices
                .map((c) => DropdownMenuItem(value: c.$2, child: Text(c.$1)))
                .toList(growable: false),
            onChanged: _busy ? null : (v) => setState(() => _params = v ?? _params),
          ),
          const SizedBox(height: 8),
          Text(
            'Astuce : si le coffre semble vide alors qu\'il devrait contenir des '
            'éléments chiffrés côté web, essayez le profil "Desktop" — c\'est '
            'celui que l\'app web utilise par défaut.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            key: const ValueKey('cloudity_pass_unlock_submit'),
            onPressed: _busy ? null : _unlock,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.lock_open),
            label: Text(_busy ? 'Dérivation Argon2id…' : 'Déverrouiller'),
          ),
        ],
      ),
    );
  }
}
