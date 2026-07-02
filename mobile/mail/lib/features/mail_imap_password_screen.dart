import 'package:flutter/material.dart';

import '../api/auth_api.dart';

/// Resaisie du mot de passe IMAP pour une boîte (sync bloquée).
class MailImapPasswordScreen extends StatefulWidget {
  const MailImapPasswordScreen({
    super.key,
    required this.api,
    required this.accessToken,
    required this.accountId,
    required this.accountEmail,
    this.lastSyncError,
  });

  final AuthApi api;
  final String accessToken;
  final int accountId;
  final String accountEmail;
  final String? lastSyncError;

  @override
  State<MailImapPasswordScreen> createState() => _MailImapPasswordScreenState();
}

class _MailImapPasswordScreenState extends State<MailImapPasswordScreen> {
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pwd = _passwordCtrl.text;
    if (pwd.trim().isEmpty) {
      setState(() => _error = 'Saisissez le mot de passe IMAP.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.api.syncMailAccount(
        accessToken: widget.accessToken,
        accountId: widget.accountId,
        password: pwd,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _submitting = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mot de passe IMAP')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            widget.accountEmail,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'La synchronisation IMAP nécessite votre mot de passe de boîte mail. Il est chiffré côté serveur.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (widget.lastSyncError != null && widget.lastSyncError!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Material(
              color: Theme.of(context).colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  widget.lastSyncError!,
                  style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          TextField(
            key: const ValueKey('cloudity_mail_imap_password'),
            controller: _passwordCtrl,
            obscureText: _obscure,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'Mot de passe IMAP',
              errorText: _error,
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Enregistrer et synchroniser'),
          ),
        ],
      ),
    );
  }
}
