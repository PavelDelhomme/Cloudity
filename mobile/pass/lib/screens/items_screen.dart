import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import '../features/pass_crypto.dart';
import '../features/pass_local_backup.dart';
import '../auth/user_session.dart';
import '../features/vault_controller.dart';
import 'item_detail_screen.dart';

class PassItemsScreen extends StatefulWidget {
  const PassItemsScreen({
    super.key,
    required this.session,
    required this.controller,
    required this.vaultId,
    required this.vaultName,
    this.offlineDoc,
  });

  final PassUserSession session;
  final VaultController controller;
  final int vaultId;
  final String vaultName;
  final Map<String, dynamic>? offlineDoc;

  @override
  State<PassItemsScreen> createState() => _PassItemsScreenState();
}

class _DecodedItemPreview {
  _DecodedItemPreview({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.envelopeB64u,
    required this.formatVersion,
    this.url,
    this.error,
    this.type,
  });

  final int id;
  final String title;
  final String? subtitle;
  final String? url;
  final String envelopeB64u;
  final int formatVersion;
  final String? type;
  final String? error;

  bool get hasError => error != null;
}

class _PassItemsScreenState extends State<PassItemsScreen> {
  late Future<List<_DecodedItemPreview>> _items;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _items = _load();
  }

  Future<List<_DecodedItemPreview>> _load() async {
    List<Map<String, dynamic>> raw;
    try {
      raw = await widget.session.api.fetchItems(
        accessToken: widget.session.accessToken,
        vaultId: widget.vaultId,
      );
    } catch (_) {
      raw = PassLocalBackupStore.itemsForVault(widget.offlineDoc, widget.vaultId);
      if (raw.isEmpty) rethrow;
    }
    final out = <_DecodedItemPreview>[];
    for (final r in raw) {
      final id = (r['id'] as int?) ?? 0;
      final ct = (r['ciphertext'] as String?) ?? '';
      final fv = (r['format_version'] as int?) ?? 0;
      if (fv != 1 || ct.isEmpty) {
        out.add(_DecodedItemPreview(
          id: id,
          title: 'Élément #$id',
          subtitle: 'Format v$fv non supporté en lecture seule mobile',
          envelopeB64u: ct,
          formatVersion: fv,
          error: 'format_version=$fv (attendu 1)',
        ));
        continue;
      }
      try {
        final plain = await decryptItemFromVault(
          envelopeB64u: ct,
          masterKey: widget.controller.masterKey,
        );
        final title = plain.title?.trim().isNotEmpty == true
            ? plain.title!.trim()
            : (plain.url ?? 'Élément #$id');
        out.add(_DecodedItemPreview(
          id: id,
          title: title,
          subtitle: plain.username ?? plain.url,
          url: plain.url,
          envelopeB64u: ct,
          formatVersion: fv,
          type: plain.type,
        ));
      } catch (e) {
        out.add(_DecodedItemPreview(
          id: id,
          title: 'Élément #$id',
          subtitle: 'Déchiffrement impossible',
          envelopeB64u: ct,
          formatVersion: fv,
          error: e.toString(),
        ));
      }
    }
    return out;
  }

  Future<void> _refresh() async {
    setState(() => _items = _load());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.vaultName),
        actions: [
          IconButton(
            tooltip: 'Verrouiller',
            icon: const Icon(Icons.lock_outline),
            onPressed: () => widget.controller.lock(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Rechercher (titre, utilisateur, URL)',
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<List<_DecodedItemPreview>>(
                future: _items,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return ListView(children: [
                      Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'Erreur : ${snap.error}',
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error),
                        ),
                      ),
                    ]);
                  }
                  final all = snap.data ?? const <_DecodedItemPreview>[];
                  final filtered = _query.isEmpty
                      ? all
                      : all
                          .where((e) =>
                              e.title.toLowerCase().contains(_query) ||
                              (e.subtitle ?? '').toLowerCase().contains(_query))
                          .toList(growable: false);
                  if (filtered.isEmpty) {
                    return ListView(children: const [
                      Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Aucun élément. Ajoutez-en depuis l\'app web (édition mobile en L2).',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ]);
                  }
                  return ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final it = filtered[i];
                      return ListTile(
                        leading: PassFavicon(
                          gatewayBase: widget.session.api.baseUrl,
                          url: it.url,
                          title: it.title,
                          size: 36,
                        ),
                        title: Text(it.title),
                        subtitle: it.subtitle == null ? null : Text(it.subtitle!),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: it.hasError
                            ? null
                            : () {
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => PassItemDetailScreen(
                                    title: it.title,
                                    url: it.url,
                                    envelopeB64u: it.envelopeB64u,
                                    controller: widget.controller,
                                    gatewayBase: widget.session.api.baseUrl,
                                  ),
                                ));
                              },
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
