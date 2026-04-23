import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'mail_validation.dart';
import 'user_session.dart';

/// Envoi minimal (SMTP via gateway) — pas de brouillon serveur dans cette version.
class ComposeMailScreen extends StatefulWidget {
  const ComposeMailScreen({
    super.key,
    required this.session,
    required this.accountId,
  });

  final UserSession session;
  final int accountId;

  @override
  State<ComposeMailScreen> createState() => _ComposeMailScreenState();
}

class _ComposeMailScreenState extends State<ComposeMailScreen> {
  final _toCtrl = TextEditingController();
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _toCtrl.dispose();
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final to = _toCtrl.text.trim();
    if (!isValidRecipientEmail(to)) {
      setState(() => _error = 'Adresse destinataire invalide.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    Future<void> once() async {
      await widget.session.refreshIfNeeded();
      final pwd = _passwordCtrl.text.trim();
      await widget.session.api.sendMail(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        to: to,
        subject: _subjectCtrl.text.trim(),
        body: _bodyCtrl.text,
        password: pwd.isEmpty ? null : pwd,
      );
    }
    try {
      await once();
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await once();
        } catch (e2) {
          if (mounted) {
            setState(() {
              _error = e2 is AuthException ? e2.message : e2.toString();
              _sending = false;
            });
          }
          return;
        }
      } else {
        if (mounted) {
          setState(() {
            _error = e.message;
            _sending = false;
          });
        }
        return;
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _sending = false;
        });
      }
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message envoyé.')));
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_compose'),
      appBar: AppBar(
        title: const Text('Nouveau message'),
        actions: [
          TextButton(
            onPressed: _sending ? null : _send,
            child: _sending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Envoyer'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            key: const ValueKey('cloudity_mail_compose_to'),
            controller: _toCtrl,
            decoration: const InputDecoration(labelText: 'À', hintText: 'destinataire@domaine.tld'),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('cloudity_mail_compose_subject'),
            controller: _subjectCtrl,
            decoration: const InputDecoration(labelText: 'Objet'),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('cloudity_mail_compose_body'),
            controller: _bodyCtrl,
            decoration: const InputDecoration(labelText: 'Message', alignLabelWithHint: true),
            minLines: 6,
            maxLines: 18,
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('cloudity_mail_compose_password'),
            controller: _passwordCtrl,
            decoration: const InputDecoration(
              labelText: 'Mot de passe SMTP (optionnel)',
              helperText: 'Uniquement si la boîte n’a pas de secret enregistré côté serveur.',
            ),
            obscureText: true,
            autocorrect: false,
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ],
      ),
    );
  }
}
