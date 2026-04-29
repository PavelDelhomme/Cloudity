import 'package:flutter/material.dart';
import 'dart:async';

import 'auth_api.dart';
import 'compose_mail_screen.dart';
import 'message_detail_screen.dart';
import 'user_session.dart';

class _MailLifecycleObserver extends WidgetsBindingObserver {
  _MailLifecycleObserver({required this.onResume});
  final VoidCallback onResume;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) onResume();
  }
}

class _FolderDef {
  const _FolderDef(this.api, this.label);
  final String api;
  final String label;
}

const List<_FolderDef> _kStandardFolders = [
  _FolderDef('inbox', 'Réception'),
  _FolderDef('sent', 'Envoyés'),
  _FolderDef('drafts', 'Brouillons'),
  _FolderDef('spam', 'Spam'),
  _FolderDef('trash', 'Corbeille'),
  _FolderDef('archive', 'Archive'),
];

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key, required this.session, required this.onLogout});

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  List<Map<String, dynamic>> _accounts = [];
  int? _accountId;
  List<Map<String, dynamic>> _messages = [];
  int _total = 0;
  bool _loading = true;
  String? _error;
  String _folder = 'inbox';
  Map<String, dynamic>? _folderSummary;
  Timer? _mailSyncTimer;
  int _lastBackgroundSyncAtMs = 0;
  bool _backgroundSyncing = false;
  int _bottomNavIndex = 0;

  static const int _mailBackgroundSyncIntervalMs = 25000;
  static const int _mailVisibilitySyncMinGapMs = 22000;

  @override
  void initState() {
    super.initState();
    _reloadAccounts();
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    _mailSyncTimer = Timer.periodic(
      const Duration(milliseconds: _mailBackgroundSyncIntervalMs),
      (_) => _syncAllAccountsInBackground(),
    );
  }

  @override
  void dispose() {
    _mailSyncTimer?.cancel();
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    super.dispose();
  }

  late final WidgetsBindingObserver _lifecycleObserver = _MailLifecycleObserver(
    onResume: () {
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - _lastBackgroundSyncAtMs < _mailVisibilitySyncMinGapMs) return;
      _syncAllAccountsInBackground();
    },
  );

  Future<void> _syncAllAccountsInBackground() async {
    if (!mounted || _backgroundSyncing || _accounts.isEmpty) return;
    _backgroundSyncing = true;
    int totalSynced = 0;
    String? firstAccountName;
    try {
      await widget.session.refreshIfNeeded();
      for (final acc in _accounts) {
        final rawId = acc['id'];
        final id = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
        if (id == null) continue;
        try {
          final synced = await widget.session.api.syncMailAccount(
            accessToken: widget.session.accessToken,
            accountId: id,
          );
          if (synced > 0) {
            totalSynced += synced;
            firstAccountName ??=
                ((acc['label']?.toString().trim().isNotEmpty ?? false)
                ? acc['label']?.toString()
                : acc['email']?.toString());
          }
        } catch (_) {
          // Une boîte peut échouer (IMAP/réseau) sans bloquer les autres.
        }
      }
      _lastBackgroundSyncAtMs = DateTime.now().millisecondsSinceEpoch;
      if (totalSynced > 0 && mounted) {
        final who = (firstAccountName ?? 'Mail').trim();
        final msg = totalSynced == 1
            ? '$who — 1 nouveau message'
            : '$who — $totalSynced nouveaux messages';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), duration: const Duration(seconds: 3)),
        );
      }
      if (mounted) {
        await _reloadSummary();
        await _reloadMessages();
      }
    } catch (_) {
      // Ignorer : la prochaine itération reprendra.
    } finally {
      _backgroundSyncing = false;
    }
  }

  int _unreadForFolder(String apiKey) {
    final s = _folderSummary?[apiKey];
    if (s is Map) {
      final u = s['unread'];
      if (u is int) return u;
      if (u is num) return u.toInt();
    }
    return 0;
  }

  List<Map<String, dynamic>> _extraFoldersFromSummary() {
    final raw = _folderSummary?['extra'];
    if (raw is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final e in raw) {
      if (e is Map) {
        out.add(Map<String, dynamic>.from(e));
      }
    }
    return out;
  }

  Future<void> _reloadAccounts() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final acc = await widget.session.api.fetchMailAccounts(
        widget.session.accessToken,
      );
      if (!mounted) return;
      setState(() {
        _accounts = acc;
        if (_accountId == null && acc.isNotEmpty) {
          final id = acc.first['id'];
          _accountId = id is int ? id : int.tryParse(id?.toString() ?? '');
        }
        _loading = false;
      });
      if (_accountId != null) {
        await _reloadSummaryAndMessages();
      } else {
        if (mounted) setState(() => _loading = false);
      }
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final acc = await widget.session.api.fetchMailAccounts(
            widget.session.accessToken,
          );
          if (!mounted) return;
          setState(() {
            _accounts = acc;
            if (_accountId == null && acc.isNotEmpty) {
              final id = acc.first['id'];
              _accountId = id is int ? id : int.tryParse(id?.toString() ?? '');
            }
            _loading = false;
          });
          if (_accountId != null) await _reloadSummaryAndMessages();
          return;
        } catch (_) {
          if (mounted) setState(() => _error = 'Session expirée.');
        }
      } else {
        if (mounted) setState(() => _error = e.message);
      }
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _reloadSummaryAndMessages() async {
    await _reloadSummary();
    await _reloadMessages();
  }

  Future<void> _reloadSummary() async {
    final id = _accountId;
    if (id == null) return;
    try {
      await widget.session.refreshIfNeeded();
      final sum = await widget.session.api.fetchFolderSummary(
        accessToken: widget.session.accessToken,
        accountId: id,
      );
      if (!mounted) return;
      setState(() => _folderSummary = sum);
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final sum = await widget.session.api.fetchFolderSummary(
            accessToken: widget.session.accessToken,
            accountId: id,
          );
          if (!mounted) return;
          setState(() => _folderSummary = sum);
        } catch (_) {
          if (mounted) setState(() => _folderSummary = null);
        }
      }
    } catch (_) {
      if (mounted) setState(() => _folderSummary = null);
    }
  }

  Future<void> _reloadMessages() async {
    final id = _accountId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final page = await widget.session.api.fetchMailMessages(
        accessToken: widget.session.accessToken,
        accountId: id,
        folder: _folder,
        limit: 50,
        offset: 0,
      );
      if (!mounted) return;
      setState(() {
        _messages = page.messages;
        _total = page.total;
        _loading = false;
      });
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final page = await widget.session.api.fetchMailMessages(
            accessToken: widget.session.accessToken,
            accountId: id,
            folder: _folder,
            limit: 50,
            offset: 0,
          );
          if (!mounted) return;
          setState(() {
            _messages = page.messages;
            _total = page.total;
            _loading = false;
          });
          return;
        } catch (_) {
          if (mounted) setState(() => _error = 'Session expirée.');
        }
      } else {
        if (mounted) setState(() => _error = e.message);
      }
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  void _onAccountChanged(int? newId) {
    if (newId == null) return;
    setState(() {
      _accountId = newId;
      _folder = 'inbox';
    });
    _reloadSummaryAndMessages();
  }

  void _onFolderChanged(String api) {
    if (_folder == api) return;
    setState(() => _folder = api);
    _reloadMessages();
  }

  Future<void> _openMessage(Map<String, dynamic> m) async {
    final id = _accountId;
    if (id == null) return;
    final mid = m['id'];
    final messageId = mid is int ? mid : int.tryParse(mid?.toString() ?? '');
    if (messageId == null || messageId <= 0) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (ctx) => MessageDetailScreen(
          session: widget.session,
          accountId: id,
          messageId: messageId,
        ),
      ),
    );
    if (!mounted) return;
    await _reloadSummary();
    await _reloadMessages();
  }

  Future<void> _setMessageReadState(Map<String, dynamic> message, bool read) async {
    final id = _accountId;
    if (id == null) return;
    final mid = message['id'];
    final messageId = mid is int ? mid : int.tryParse(mid?.toString() ?? '');
    if (messageId == null || messageId <= 0) return;
    try {
      await widget.session.refreshIfNeeded();
      await widget.session.api.patchMessageRead(
        accessToken: widget.session.accessToken,
        accountId: id,
        messageId: messageId,
        read: read,
      );
      if (!mounted) return;
      setState(() => message['is_read'] = read);
      await _reloadSummary();
      await _reloadMessages();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(read ? 'Message marqué comme lu' : 'Message marqué comme non lu')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de changer l’état lu/non lu: $e')),
      );
    }
  }

  Future<void> _openCompose() async {
    final id = _accountId;
    if (id == null) return;
    final sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (ctx) =>
            ComposeMailScreen(session: widget.session, accountId: id),
      ),
    );
    if (!mounted) return;
    if (sent == true) {
      await _reloadSummary();
      await _reloadMessages();
    }
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Effacer la session sur cet appareil ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Déconnecter'),
          ),
        ],
      ),
    );
    if (ok == true) await widget.onLogout();
  }

  String _folderTitle() {
    for (final f in _kStandardFolders) {
      if (f.api == _folder) return f.label;
    }
    return _folder;
  }

  Widget _buildMessagesView() {
    return RefreshIndicator(
      onRefresh: () async {
        await _reloadSummary();
        await _reloadMessages();
      },
      child: _loading && _accounts.isEmpty
          ? ListView(children: const [SizedBox(height: 120), Center(child: CircularProgressIndicator())])
          : _error != null && _accounts.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 16),
                FilledButton(onPressed: _reloadAccounts, child: const Text('Réessayer')),
              ],
            )
          : _accounts.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 80),
                Text('Aucun compte mail relié. Ajoutez une boîte depuis le tableau de bord web (Mail).'),
              ],
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Text('${_folderTitle()} ($_total)', style: Theme.of(context).textTheme.titleSmall),
                ),
                if (_loading && _messages.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_error != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  )
                else
                  ..._messages.map((m) {
                    final sub = m['subject']?.toString() ?? '(sans objet)';
                    final from = m['from']?.toString() ?? '';
                    final att = m['attachment_count'];
                    final nAtt = att is int ? att : (att is num ? att.toInt() : 0);
                    final read = m['is_read'];
                    final isRead = read == true;
                    return ListTile(
                      title: Text(
                        sub,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.w600),
                      ),
                      subtitle: Text(from, maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (nAtt > 0)
                            Tooltip(
                              message: '$nAtt pièce(s) jointe(s)',
                              child: const Icon(Icons.attach_file, size: 20),
                            ),
                          PopupMenuButton<String>(
                            icon: const Icon(Icons.more_vert),
                            onSelected: (value) {
                              if (value == 'toggle-read') {
                                _setMessageReadState(m, !isRead);
                              }
                            },
                            itemBuilder: (ctx) => [
                              PopupMenuItem<String>(
                                value: 'toggle-read',
                                child: Text(isRead ? 'Marquer comme non lu' : 'Marquer comme lu'),
                              ),
                            ],
                          ),
                        ],
                      ),
                      onTap: () => _openMessage(m),
                    );
                  }),
              ],
            ),
    );
  }

  Widget _buildAccountsView() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: _accounts
          .map((a) {
            final rawId = a['id'];
            final aid = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
            if (aid == null) return const SizedBox.shrink();
            final email = a['email']?.toString() ?? '';
            final label = a['label']?.toString() ?? '';
            final selected = _accountId == aid;
            return Card(
              child: ListTile(
                selected: selected,
                leading: const Icon(Icons.mail_outline),
                title: Text(label.isNotEmpty ? label : email),
                subtitle: label.isNotEmpty ? Text(email) : null,
                trailing: selected ? const Icon(Icons.check_circle, color: Colors.greenAccent) : null,
                onTap: () => _onAccountChanged(aid),
              ),
            );
          })
          .toList(),
    );
  }

  Widget _buildFoldersView() {
    final extras = _extraFoldersFromSummary();
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ..._kStandardFolders.map((f) {
          final selected = _folder == f.api;
          final unread = _unreadForFolder(f.api);
          return Card(
            child: ListTile(
              selected: selected,
              leading: const Icon(Icons.folder_outlined),
              title: Text(f.label),
              trailing: unread > 0 ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11))) : null,
              onTap: () => _onFolderChanged(f.api),
            ),
          );
        }),
        ...extras.map((ex) {
          final path = ex['folder']?.toString() ?? '';
          if (path.isEmpty) return const SizedBox.shrink();
          final selected = _folder == path;
          final u = ex['unread'];
          final unread = u is int ? u : (u is num ? u.toInt() : 0);
          return Card(
            child: ListTile(
              selected: selected,
              leading: const Icon(Icons.folder_special_outlined),
              title: Text(path),
              trailing: unread > 0 ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11))) : null,
              onTap: () => _onFolderChanged(path),
            ),
          );
        }),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_inbox'),
      appBar: AppBar(
        title: const Text('Cloudity Mail'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _reloadAccounts),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              const ListTile(title: Text('Menu Mail', style: TextStyle(fontWeight: FontWeight.w700))),
              ListTile(
                leading: const Icon(Icons.inbox_outlined),
                title: const Text('Mails'),
                onTap: () {
                  setState(() => _bottomNavIndex = 0);
                  Navigator.of(context).pop();
                },
              ),
              ListTile(
                leading: const Icon(Icons.alternate_email),
                title: const Text('Boîtes'),
                onTap: () {
                  setState(() => _bottomNavIndex = 1);
                  Navigator.of(context).pop();
                },
              ),
              ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: const Text('Dossiers'),
                onTap: () {
                  setState(() => _bottomNavIndex = 2);
                  Navigator.of(context).pop();
                },
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Déconnexion'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await _confirmLogout();
                },
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: _accountId != null
          ? FloatingActionButton.extended(
              key: const ValueKey('cloudity_mail_compose_open'),
              onPressed: _loading ? null : _openCompose,
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Nouveau'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _bottomNavIndex,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.inbox_outlined), selectedIcon: Icon(Icons.inbox), label: 'Mails'),
          NavigationDestination(icon: Icon(Icons.alternate_email_outlined), selectedIcon: Icon(Icons.alternate_email), label: 'Boîtes'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: 'Dossiers'),
        ],
        onDestinationSelected: (i) => setState(() => _bottomNavIndex = i),
      ),
      body: _bottomNavIndex == 1 ? _buildAccountsView() : _bottomNavIndex == 2 ? _buildFoldersView() : _buildMessagesView(),
    );
  }
}
