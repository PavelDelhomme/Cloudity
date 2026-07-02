import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/pass_crypto.dart';
import '../features/vault_controller.dart';

/// Durée avant auto-effacement du presse-papiers (alignée sur le web).
const Duration kClipboardAutoClearAfter = Duration(seconds: 30);

class PassItemDetailScreen extends StatefulWidget {
  const PassItemDetailScreen({
    super.key,
    required this.title,
    required this.envelopeB64u,
    required this.controller,
  });

  final String title;
  final String envelopeB64u;
  final VaultController controller;

  @override
  State<PassItemDetailScreen> createState() => _PassItemDetailScreenState();
}

class _PassItemDetailScreenState extends State<PassItemDetailScreen> {
  PassItemPlaintext? _plain;
  String? _error;
  bool _passwordRevealed = false;
  Timer? _clipboardClearTimer;

  @override
  void initState() {
    super.initState();
    _decrypt();
  }

  @override
  void dispose() {
    _clipboardClearTimer?.cancel();
    super.dispose();
  }

  Future<void> _decrypt() async {
    if (!widget.controller.isUnlocked) {
      setState(() => _error = 'Coffre verrouillé');
      return;
    }
    try {
      final p = await decryptItemFromVault(
        envelopeB64u: widget.envelopeB64u,
        masterKey: widget.controller.masterKey,
      );
      if (!mounted) return;
      setState(() => _plain = p);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Déchiffrement impossible : $e');
    }
  }

  Future<void> _copyToClipboard(String value, String label) async {
    widget.controller.bumpActivity();
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('$label copié — auto-effacement dans 30 s'),
      duration: const Duration(seconds: 2),
    ));
    _clipboardClearTimer?.cancel();
    _clipboardClearTimer = Timer(kClipboardAutoClearAfter, () async {
      // Best-effort : on n'écrase que si la valeur copiée est encore là.
      try {
        final current = await Clipboard.getData(Clipboard.kTextPlain);
        if (current?.text == value) {
          await Clipboard.setData(const ClipboardData(text: ''));
        }
      } catch (_) {
        // Pas grave en cas d'erreur — l'utilisateur a copié autre chose entre-temps.
      }
    });
  }

  Widget _buildField({
    required String label,
    required String? value,
    bool obscure = false,
    bool isPassword = false,
  }) {
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    final display = obscure ? '•' * value.length.clamp(8, 24) : value;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 2),
                SelectableText(display, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
          if (isPassword)
            IconButton(
              tooltip: _passwordRevealed ? 'Masquer' : 'Afficher',
              icon: Icon(_passwordRevealed ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _passwordRevealed = !_passwordRevealed),
            ),
          IconButton(
            tooltip: 'Copier',
            icon: const Icon(Icons.copy),
            onPressed: () => _copyToClipboard(value, label),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Verrouiller',
            icon: const Icon(Icons.lock_outline),
            onPressed: () => widget.controller.lock(),
          ),
        ],
      ),
      body: SafeArea(
        child: _error != null
            ? Padding(
                padding: const EdgeInsets.all(20),
                child: Text(_error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              )
            : _plain == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildField(label: 'Titre', value: _plain!.title),
                      _buildField(label: 'URL', value: _plain!.url),
                      _buildField(label: 'Utilisateur', value: _plain!.username),
                      _buildField(
                        label: 'Mot de passe',
                        value: _plain!.password,
                        obscure: !_passwordRevealed,
                        isPassword: true,
                      ),
                      _buildField(label: 'TOTP (URI)', value: _plain!.totpUri),
                      if (_plain!.notes != null && _plain!.notes!.isNotEmpty) ...[
                        const Divider(height: 24),
                        Text('Notes',
                            style: Theme.of(context).textTheme.labelSmall),
                        const SizedBox(height: 4),
                        SelectableText(_plain!.notes!),
                      ],
                      if (_plain!.tags.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _plain!.tags
                              .map((t) => Chip(label: Text(t)))
                              .toList(growable: false),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'Type : ${_plain!.type}  •  schema v${_plain!.schema}',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.black54),
                      ),
                    ],
                  ),
      ),
    );
  }
}
