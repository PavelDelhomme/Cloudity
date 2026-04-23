import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'compose_mail_screen.dart';
import 'message_detail_screen.dart';
import 'user_session.dart';

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
  const InboxScreen({
    super.key,
    required this.session,
    required this.onLogout,
  });

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

  @override
  void initState() {
    super.initState();
    _reloadAccounts();
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
      final acc = await widget.session.api.fetchMailAccounts(widget.session.accessToken);
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
          final acc = await widget.session.api.fetchMailAccounts(widget.session.accessToken);
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

  Future<void> _openCompose() async {
    final id = _accountId;
    if (id == null) return;
    final sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (ctx) => ComposeMailScreen(
          session: widget.session,
          accountId: id,
        ),
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
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Déconnecter')),
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

  Widget _folderChipsRow() {
    final extras = _extraFoldersFromSummary();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: Row(
        children: [
          ..._kStandardFolders.map((def) {
            final selected = _folder == def.api;
            final unread = _unreadForFolder(def.api);
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                key: ValueKey('cloudity_mail_folder_${def.api}'),
                label: Text(unread > 0 ? '${def.label} ($unread)' : def.label),
                selected: selected,
                onSelected: (sel) {
                  if (sel) _onFolderChanged(def.api);
                },
              ),
            );
          }),
          ...extras.map((ex) {
            final path = ex['folder']?.toString() ?? '';
            if (path.isEmpty) return const SizedBox.shrink();
            final selected = _folder == path;
            final u = ex['unread'];
            final unread = u is int ? u : (u is num ? u.toInt() : 0);
            final short = path.length > 18 ? '${path.substring(0, 15)}…' : path;
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                key: ValueKey('cloudity_mail_folder_extra_$path'),
                label: Text(unread > 0 ? '$short ($unread)' : short),
                selected: selected,
                onSelected: (sel) {
                  if (sel) _onFolderChanged(path);
                },
              ),
            );
          }),
        ],
      ),
    );
  }

  PreferredSizeWidget _appBarBottom() {
    final accountPicker = _accounts.length > 1
        ? Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Boîte mail',
                border: OutlineInputBorder(),
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<int>(
                  key: const ValueKey('cloudity_mail_account_dropdown'),
                  isExpanded: true,
                  value: _accountId,
                  items: _accounts.map((a) {
                    final rawId = a['id'];
                    final aid = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
                    if (aid == null) return null;
                    final email = a['email']?.toString() ?? '';
                    final label = a['label']?.toString() ?? '';
                    final title = label.isNotEmpty ? '$label — $email' : email;
                    return DropdownMenuItem<int>(
                      value: aid,
                      child: Text(title, overflow: TextOverflow.ellipsis, maxLines: 1),
                    );
                  }).whereType<DropdownMenuItem<int>>().toList(),
                  onChanged: _onAccountChanged,
                ),
              ),
            ),
          )
        : const SizedBox.shrink();

    return PreferredSize(
      preferredSize: Size.fromHeight(_accounts.length > 1 ? 124 : 56),
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            accountPicker,
            _folderChipsRow(),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_inbox'),
      appBar: AppBar(
        title: const Text('Cloudity Mail'),
        bottom: _accounts.isNotEmpty ? _appBarBottom() : null,
        actions: [
          if (_accountId != null)
            IconButton(
              key: const ValueKey('cloudity_mail_compose_open'),
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Nouveau message',
              onPressed: _loading ? null : _openCompose,
            ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _reloadAccounts),
          IconButton(icon: const Icon(Icons.logout), onPressed: _confirmLogout),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _reloadSummary();
          await _reloadMessages();
        },
        child: _loading && _accounts.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
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
                          Text(
                            'Aucun compte mail relié. Ajoutez une boîte depuis le tableau de bord web (Mail).',
                          ),
                        ],
                      )
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                        children: [
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
                          else ...[
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              child: Text(
                                '${_folderTitle()} ($_total)',
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                            ),
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
                                trailing: nAtt > 0
                                    ? Tooltip(
                                        message: '$nAtt pièce(s) jointe(s)',
                                        child: const Icon(Icons.attach_file, size: 20),
                                      )
                                    : null,
                                onTap: () => _openMessage(m),
                              );
                            }),
                          ],
                        ],
                      ),
      ),
    );
  }
}
