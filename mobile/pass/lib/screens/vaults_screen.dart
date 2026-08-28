import 'dart:async';

import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import '../auth/user_session.dart';
import '../features/pass_local_backup.dart';
import '../features/vault_controller.dart';
import 'items_screen.dart';
import 'pass_settings_screen.dart';

class PassVaultsScreen extends StatefulWidget {
  const PassVaultsScreen({
    super.key,
    required this.session,
    required this.controller,
    required this.onLogout,
    this.offlineMode = false,
    this.localBackupAt,
  });

  final PassUserSession session;
  final VaultController controller;
  final VoidCallback onLogout;
  final bool offlineMode;
  final String? localBackupAt;

  @override
  State<PassVaultsScreen> createState() => _PassVaultsScreenState();
}

class _PassVaultsScreenState extends State<PassVaultsScreen> {
  late Future<List<Map<String, dynamic>>> _vaults;
  Map<String, dynamic>? _localDoc;
  final _newVaultCtrl = TextEditingController(text: 'Mon coffre');
  bool _creatingVault = false;
  String? _createError;

  @override
  void initState() {
    super.initState();
    _vaults = _load();
    _applyPassPrefs();
  }

  @override
  void dispose() {
    _newVaultCtrl.dispose();
    super.dispose();
  }

  Future<void> _applyPassPrefs() async {
    final prefs = await UserPreferencesStore.loadCached();
    widget.controller.applyPassSettings(prefs.pass);
  }

  Future<List<Map<String, dynamic>>> _load() async {
    try {
      final rows = await widget.session.api.fetchVaults(widget.session.accessToken);
      if (widget.session.userId.isNotEmpty) {
        unawaited(
          PassLocalBackupStore.saveFromApi(
            userId: widget.session.userId,
            vaultRows: rows,
            fetchItems: (id) => widget.session.api.fetchItems(
              accessToken: widget.session.accessToken,
              vaultId: id,
            ),
          ),
        );
      }
      return rows;
    } catch (_) {
      _localDoc = await PassLocalBackupStore.load(widget.session.userId);
      final local = PassLocalBackupStore.vaultsFromDocument(_localDoc);
      if (local.isNotEmpty) return local;
      rethrow;
    }
  }

  Future<void> _refresh() async {
    setState(() => _vaults = _load());
  }

  Future<void> _createVault() async {
    if (widget.offlineMode || _localDoc != null) {
      setState(() => _createError = 'Création impossible hors ligne.');
      return;
    }
    setState(() {
      _creatingVault = true;
      _createError = null;
    });
    try {
      final pair = await widget.session.api.ensureValidTokens(
        accessToken: widget.session.accessToken,
        refreshToken: widget.session.refreshToken,
      );
      widget.session.accessToken = pair.access;
      widget.session.refreshToken = pair.refresh;
      await widget.session.persist();
      await widget.session.api.createVault(
        accessToken: widget.session.accessToken,
        name: _newVaultCtrl.text,
      );
      if (!mounted) return;
      await _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Coffre créé.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _createError = e.toString());
    } finally {
      if (mounted) setState(() => _creatingVault = false);
    }
  }

  Widget _emptyVaultsBody(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(Icons.vpn_key_outlined, size: 48, color: cs.primary),
        const SizedBox(height: 16),
        Text(
          'Aucun coffre pour l’instant',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          'Crée ton premier coffre ici — il sera visible aussi sur le web Cloudity Pass.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cs.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _newVaultCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Nom du coffre',
            border: OutlineInputBorder(),
          ),
          enabled: !_creatingVault,
        ),
        if (_createError != null) ...[
          const SizedBox(height: 12),
          Text(
            _createError!,
            style: TextStyle(color: cs.error),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _creatingVault ? null : _createVault,
          icon: _creatingVault
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.add),
          label: Text(_creatingVault ? 'Création…' : 'Créer le coffre'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Coffres'),
        actions: [
          IconButton(
            tooltip: 'Paramètres',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {
              Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => PassSettingsScreen(
                  session: widget.session,
                  onLogout: widget.onLogout,
                ),
              )).then((_) => _applyPassPrefs());
            },
          ),
          IconButton(
            tooltip: 'Verrouiller le coffre',
            icon: const Icon(Icons.lock_outline),
            onPressed: () => widget.controller.lock(),
          ),
          IconButton(
            tooltip: 'Se déconnecter',
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _vaults,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'Impossible de charger les coffres : ${snap.error}',
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ),
                ],
              );
            }
            final vaults = snap.data ?? const [];
            final offlineBanner = widget.offlineMode || _localDoc != null;
            if (vaults.isEmpty) {
              return _emptyVaultsBody(context);
            }
            return ListView.separated(
              itemCount: vaults.length + (offlineBanner ? 1 : 0),
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                if (offlineBanner && i == 0) {
                  final at = widget.localBackupAt ??
                      PassLocalBackupStore.exportedAtLabel(_localDoc);
                  return ListTile(
                    leading: Icon(Icons.cloud_off, color: Theme.of(context).colorScheme.primary),
                    title: const Text('Mode hors ligne'),
                    subtitle: Text(
                      at != null
                          ? 'Sauvegarde locale du $at — lecture seule'
                          : 'Sauvegarde locale — lecture seule',
                    ),
                  );
                }
                final idx = offlineBanner ? i - 1 : i;
                final v = vaults[idx];
                final id = (v['id'] as int?) ?? 0;
                final name = (v['name'] as String?) ?? 'Coffre #$id';
                return ListTile(
                  leading: const Icon(Icons.vpn_key_outlined),
                  title: Text(name),
                  subtitle: Text('ID $id'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => PassItemsScreen(
                        session: widget.session,
                        controller: widget.controller,
                        vaultId: id,
                        vaultName: name,
                        offlineDoc: _localDoc,
                      ),
                    ));
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
