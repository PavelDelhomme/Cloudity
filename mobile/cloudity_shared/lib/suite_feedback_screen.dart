import 'package:flutter/material.dart';

import 'cloudity_crash_reporter.dart';
import 'cloudity_error_ui.dart';

/// Formulaire « Signaler un bug » (feedback manuel, sans consentement analytics).
class SuiteFeedbackScreen extends StatefulWidget {
  const SuiteFeedbackScreen({super.key, this.screenName});

  final String? screenName;

  @override
  State<SuiteFeedbackScreen> createState() => _SuiteFeedbackScreenState();
}

class _SuiteFeedbackScreenState extends State<SuiteFeedbackScreen> {
  final _controller = TextEditingController();
  bool _sending = false;
  String? _result;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.length < 8) {
      setState(() => _result = 'Décrivez le problème en au moins 8 caractères.');
      return;
    }
    setState(() {
      _sending = true;
      _result = null;
    });
    final ok = await CloudityCrashReporter.reportManual(
      message: text,
      screenName: widget.screenName,
      metadata: {'source': 'SuiteFeedbackScreen'},
    );
    if (!mounted) return;
    setState(() {
      _sending = false;
      _result = ok
          ? 'Merci — le rapport a été envoyé (ou sera synchronisé au prochain réseau).'
          : 'Envoi impossible pour l’instant. Le rapport est enregistré localement et partira dès que le gateway répond.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Signaler un problème')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Décrivez ce qui s’est passé. Le rapport inclut le produit Cloudity, '
            'la version OS et éventuellement votre email de session (jamais le mot de passe).',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Description',
              border: OutlineInputBorder(),
              hintText: 'Ex. : impossible d’ouvrir Drive après login…',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _sending ? null : _submit,
            icon: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_outlined),
            label: Text(_sending ? 'Envoi…' : 'Envoyer le rapport'),
          ),
          if (_result != null) ...[
            const SizedBox(height: 16),
            CloudityErrorBanner(message: _result!, compact: true),
          ],
        ],
      ),
    );
  }
}
