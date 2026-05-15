import 'package:flutter/material.dart';

import '../pass_api.dart';
import '../pass_crypto.dart';
import '../session_store.dart';
import '../user_session.dart';
import '../vault_controller.dart';

/// Après connexion Cloudity : sonde `GET /pass/vaults` pour distinguer
/// **première initialisation** (liste vide) et **déverrouillage** d’un coffre
/// existant — aligné sur le hub web (`PassPage` / `UnlockScreen`).
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
  final _confirmCtrl = TextEditingController();
  Argon2idParams _params = Argon2idParams.mobileLow;
  bool _busy = false;
  String? _error;

  bool _probeLoading = true;
  String? _probeError;
  /// `true` = aucun coffre côté serveur → choix du maître (comme le web).
  bool _isFirstVault = false;

  static const _minMasterLen = 8;

  static const _profileChoices = <(String, Argon2idParams)>[
    ('Mobile (rapide)', Argon2idParams.mobileLow),
    ('Mobile haut-de-gamme', Argon2idParams.mobileHigh),
    ('Desktop (compatible web)', Argon2idParams.desktop),
  ];

  @override
  void initState() {
    super.initState();
    _runProbe();
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _runProbe() async {
    setState(() {
      _probeLoading = true;
      _probeError = null;
    });
    try {
      final pair = await widget.session.api.ensureValidTokens(
        accessToken: widget.session.accessToken,
        refreshToken: widget.session.refreshToken,
      );
      widget.session.accessToken = pair.access;
      widget.session.refreshToken = pair.refresh;
      await PassSessionStore.saveSession(
        gatewayUrl: widget.session.api.baseUrl,
        accessToken: pair.access,
        refreshToken: pair.refresh,
        userId: widget.session.userId,
        userEmail: widget.session.userEmail,
      );
      final vaults = await widget.session.api.fetchVaults(widget.session.accessToken);
      if (!mounted) return;
      setState(() {
        _isFirstVault = vaults.isEmpty;
        _probeLoading = false;
        if (_isFirstVault) {
          _params = Argon2idParams.desktop;
        }
      });
    } on PassException catch (e) {
      if (!mounted) return;
      if (e.message == 'non_autorisé') {
        widget.onLogout();
        return;
      }
      setState(() {
        _probeError = e.message;
        _isFirstVault = false;
        _probeLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _probeError = e.toString();
        _isFirstVault = false;
        _probeLoading = false;
      });
    }
  }

  Future<void> _submit() async {
    final master = _passwordCtrl.text;
    if (master.length < _minMasterLen) {
      setState(() => _error = 'Mot de passe maître : au moins $_minMasterLen caractères.');
      return;
    }
    if (_isFirstVault) {
      if (_confirmCtrl.text != master) {
        setState(() => _error = 'Les deux saisies ne correspondent pas.');
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.controller.unlock(
        masterPassword: master,
        userId: widget.session.userId,
        params: _params,
      );
      if (!mounted) return;
      if (widget.controller.unlockError != null) {
        setState(() => _error = widget.controller.unlockError);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isFirstVault
                  ? 'Coffre initialisé — mémorise ce mot de passe maître (Cloudity ne peut pas le réinitialiser).'
                  : 'Coffre déverrouillé.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _isFirstVault ? 'Initialiser le coffre' : 'Déverrouiller le coffre';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Se déconnecter du compte',
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
          ),
        ],
      ),
      body: _probeLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _buildStepsCard(context),
                const SizedBox(height: 16),
                if (widget.session.userEmail != null && widget.session.userEmail!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Compte Cloudity : ${widget.session.userEmail}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                if (_probeError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Impossible de vérifier si tu as déjà des coffres : $_probeError\n'
                      'Une fois la passerelle joignable, réessaie (tire pour rafraîchir ou rouvre l’écran). '
                      'Le formulaire ci-dessous suppose un coffre existant.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.error,
                          ),
                    ),
                  ),
                Text(
                  _isFirstVault
                      ? 'Tu es connecté avec ton compte Cloudity. Choisis un mot de passe maître '
                          'pour chiffrer le coffre sur cet appareil — il n’est jamais envoyé au serveur. '
                          'En démo tu peux réutiliser le même mot de passe que la connexion ; en usage réel, '
                          'un maître distinct est recommandé (PASS-CRYPTO § 1.1).'
                      : 'Saisis le même mot de passe maître que celui utilisé pour chiffrer tes entrées '
                          '(ex. depuis le hub web). Il dérive localement la clé — il n’est jamais envoyé au serveur.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54),
                ),
                if (_isFirstVault) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Première utilisation : le profil « Desktop (compatible web) » est présélectionné '
                    'pour rester aligné avec le hub web.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54),
                  ),
                ],
                const SizedBox(height: 16),
                TextField(
                  key: const ValueKey('cloudity_pass_unlock_password'),
                  controller: _passwordCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Mot de passe maître',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _busy ? null : _submit(),
                ),
                if (_isFirstVault) ...[
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('cloudity_pass_unlock_confirm'),
                    controller: _confirmCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Confirmer le mot de passe maître',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _busy ? null : _submit(),
                  ),
                ],
                const SizedBox(height: 12),
                DropdownButtonFormField<Argon2idParams>(
                  // ignore: deprecated_member_use — champ contrôlé (changement de profil).
                  value: _params,
                  decoration: const InputDecoration(
                    labelText: 'Profil Argon2id (doit correspondre au profil ayant servi au chiffrement)',
                    border: OutlineInputBorder(),
                  ),
                  items: _profileChoices
                      .map((c) => DropdownMenuItem(value: c.$2, child: Text(c.$1)))
                      .toList(growable: false),
                  onChanged: _busy ? null : (v) => setState(() => _params = v ?? _params),
                ),
                const SizedBox(height: 8),
                if (!_isFirstVault)
                  Text(
                    'Astuce : si le coffre semble vide alors qu’il devrait contenir des '
                    'éléments chiffrés côté web, essayez le profil « Desktop » — c’est '
                    'celui que l’app web utilise par défaut.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black54),
                  ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  key: const ValueKey('cloudity_pass_unlock_submit'),
                  onPressed: _busy ? null : _submit,
                  icon: _busy
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(_isFirstVault ? Icons.auto_fix_high : Icons.lock_open),
                  label: Text(
                    _busy
                        ? 'Dérivation Argon2id…'
                        : (_isFirstVault ? 'Initialiser et continuer' : 'Déverrouiller'),
                  ),
                ),
                if (_probeError != null) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: _busy ? null : _runProbe,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Réessayer la vérification des coffres'),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _buildStepsCard(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Parcours', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(
              '1. Compte Cloudity (fait) → 2. Mot de passe maître du coffre → 3. Lecture des entrées chiffrées',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.black87),
            ),
          ],
        ),
      ),
    );
  }
}
