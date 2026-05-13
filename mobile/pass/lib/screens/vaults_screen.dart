import 'package:flutter/material.dart';

import '../user_session.dart';
import '../vault_controller.dart';
import 'items_screen.dart';

class PassVaultsScreen extends StatefulWidget {
  const PassVaultsScreen({
    super.key,
    required this.session,
    required this.controller,
    required this.onLogout,
  });

  final PassUserSession session;
  final VaultController controller;
  final VoidCallback onLogout;

  @override
  State<PassVaultsScreen> createState() => _PassVaultsScreenState();
}

class _PassVaultsScreenState extends State<PassVaultsScreen> {
  late Future<List<Map<String, dynamic>>> _vaults;

  @override
  void initState() {
    super.initState();
    _vaults = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    return widget.session.api.fetchVaults(widget.session.accessToken);
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
              itemCount: vaults.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final v = vaults[i];
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
