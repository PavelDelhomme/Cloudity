import 'dart:async';

import 'package:flutter/material.dart';

import '../auth/user_session.dart';
import '../features/pass_local_backup.dart';
import '../features/vault_controller.dart';
import 'items_screen.dart';

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

  @override
  void initState() {
    super.initState();
    _vaults = _load();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Coffres'),
        actions: [
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
              return ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Aucun coffre. Créez-en un depuis l\'app web (édition mobile en L2).',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              );
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
