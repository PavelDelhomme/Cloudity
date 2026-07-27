import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import '../features/pass_crypto.dart';
import '../features/pass_totp.dart';
import '../features/vault_controller.dart';

class PassItemDetailScreen extends StatefulWidget {
  const PassItemDetailScreen({
    super.key,
    required this.title,
    required this.envelopeB64u,
    required this.controller,
    required this.gatewayBase,
    this.url,
  });

  final String title;
  final String? url;
  final String envelopeB64u;
  final VaultController controller;
  final String gatewayBase;

  @override
  State<PassItemDetailScreen> createState() => _PassItemDetailScreenState();
}

class _PassItemDetailScreenState extends State<PassItemDetailScreen> {
  PassItemPlaintext? _plain;
  String? _error;
  bool _passwordRevealed = false;
  PassAppSettings _passPrefs = const PassAppSettings();

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    _decrypt();
  }

  Future<void> _loadPrefs() async {
    final cached = await UserPreferencesStore.loadCached();
    if (!mounted) return;
    setState(() => _passPrefs = cached.pass);
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
    if (!_passPrefs.clipboardEnabled) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Copie presse-papier désactivée (Paramètres → Pass)')),
      );
      return;
    }
    await PassClipboard.copy(value, prefs: _passPrefs);
    if (!mounted) return;
    final clearHint = _passPrefs.clipboardClearMs > 0
        ? ' — auto-effacement dans ${_passPrefs.clipboardClearMs ~/ 1000} s'
        : '';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$label copié$clearHint'), duration: const Duration(seconds: 2)),
    );
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
          if (_passPrefs.clipboardEnabled)
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
        title: Row(
          children: [
            PassFavicon(
              gatewayBase: widget.gatewayBase,
              url: widget.url ?? _plain?.url,
              title: widget.title,
              size: 28,
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(widget.title)),
          ],
        ),
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
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
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
                      if (_plain!.totpUri != null && _plain!.totpUri!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text('Code 2FA', style: Theme.of(context).textTheme.labelSmall),
                        const SizedBox(height: 4),
                        PassTotpDisplay(otpauthUri: _plain!.totpUri!, prefs: _passPrefs),
                      ],
                      if (_plain!.notes != null && _plain!.notes!.isNotEmpty) ...[
                        const Divider(height: 24),
                        Text('Notes', style: Theme.of(context).textTheme.labelSmall),
                        const SizedBox(height: 4),
                        SelectableText(_plain!.notes!),
                      ],
                      if (_plain!.tags.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _plain!.tags.map((t) => Chip(label: Text(t))).toList(growable: false),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'Type : ${_plain!.type}  •  schema v${_plain!.schema}',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
      ),
    );
  }
}
