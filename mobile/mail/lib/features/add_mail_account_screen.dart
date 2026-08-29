import 'package:flutter/material.dart';

import '../auth/user_session.dart';

/// Relie une boîte IMAP/SMTP (même contrat que le web `POST /mail/me/accounts`).
class AddMailAccountScreen extends StatefulWidget {
  const AddMailAccountScreen({super.key, required this.session});

  final UserSession session;

  @override
  State<AddMailAccountScreen> createState() => _AddMailAccountScreenState();
}

class _AddMailAccountScreenState extends State<AddMailAccountScreen> {
  final _emailCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _labelCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Adresse e-mail invalide.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      await widget.session.api.createMailAccount(
        accessToken: widget.session.accessToken,
        email: email,
        label: _labelCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter une boîte')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Même e-mail que ta boîte IMAP (OVH, Gmail mot de passe d’application, etc.). '
            'L’hôte IMAP/SMTP est détecté automatiquement.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Adresse e-mail',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _labelCtrl,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Libellé (optionnel)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _passwordCtrl,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Mot de passe IMAP / SMTP',
              helperText: 'Mot de passe d’application Gmail si 2FA.',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.add),
            label: Text(_busy ? 'Ajout…' : 'Relier la boîte'),
          ),
        ],
      ),
    );
  }
}
