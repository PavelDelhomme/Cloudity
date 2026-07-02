import 'package:flutter/material.dart';
import 'dart:async';

import 'package:cloudity_shared/cloudity_shared.dart';

import '../api/auth_api.dart';
import 'compose_mail_screen.dart';
import 'mail_account_helpers.dart';
import 'mail_imap_password_screen.dart';
import 'mail_settings_screen.dart';
import 'message_detail_screen.dart';
import '../auth/session_store.dart';
import '../auth/user_session.dart';

class _MailLifecycleObserver extends WidgetsBindingObserver {
  _MailLifecycleObserver({required this.onResume});
  final VoidCallback onResume;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) onResume();
  }
}

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
  Timer? _searchDebounce;
  final TextEditingController _searchController = TextEditingController();
  int _lastBackgroundSyncAtMs = 0;
  bool _backgroundSyncing = false;
  bool _showSettings = false;
  final Set<int> _syncIssueNotifiedAccountIds = {};

  static const int _mailBackgroundSyncIntervalMs = 25000;
  static const int _mailVisibilitySyncMinGapMs = 22000;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      if (mounted) setState(() {});
    });
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
    _searchDebounce?.cancel();
    _searchController.dispose();
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

  Future<void> _refreshAccountsFromServer() async {
    try {
      await widget.session.refreshIfNeeded();
      final acc = await widget.session.api.fetchMailAccounts(
        widget.session.accessToken,
      );
      if (!mounted) return;
      setState(() => _accounts = acc);
    } catch (_) {
      /* ignore */
    }
  }

  Map<String, dynamic>? _accountById(int? id) {
    if (id == null) return null;
    for (final acc in _accounts) {
      final rawId = acc['id'];
      final aid = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
      if (aid == id) return acc;
    }
    return null;
  }

  void _notifySyncIssueOnce(int accountId, Map<String, dynamic> acc, String message) {
    if (_syncIssueNotifiedAccountIds.contains(accountId)) return;
    _syncIssueNotifiedAccountIds.add(accountId);
    if (!mounted) return;
    final who = mailAccountLabel(acc) ?? 'Boîte mail';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$who — $message'),
        duration: const Duration(seconds: 8),
      ),
    );
  }

  Future<void> _syncAllAccountsInBackground() async {
    if (!mounted || _backgroundSyncing || _accounts.isEmpty) return;
    _backgroundSyncing = true;
    int totalSynced = 0;
    String? firstAccountName;
    var anySyncFailure = false;
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
          _syncIssueNotifiedAccountIds.remove(id);
          if (synced > 0) {
            totalSynced += synced;
            firstAccountName ??= mailAccountLabel(acc);
          }
        } on AuthException catch (e) {
          anySyncFailure = true;
          if (e.message != 'non_autorisé') {
            _notifySyncIssueOnce(id, acc, e.message);
          }
        } catch (e) {
          anySyncFailure = true;
          _notifySyncIssueOnce(
            id,
            acc,
            e.toString().replaceFirst('AuthException: ', ''),
          );
        }
      }
      if (anySyncFailure) {
        await _refreshAccountsFromServer();
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

  int? _accountIdFromMap(Map<String, dynamic> acc) {
    final id = acc['id'];
    return id is int ? id : int.tryParse(id?.toString() ?? '');
  }

  Future<void> _persistMailView() async {
    final email = await SessionStore.readAccountEmail();
    if (email == null || email.isEmpty) return;
    final tenantId = await SessionStore.readTenantId();
    await MailViewPreferences.save(
      email: email,
      tenantId: tenantId,
      accountId: _accountId,
      folder: _folder,
    );
  }

  Future<void> _applySavedMailView(List<Map<String, dynamic>> acc) async {
    final email = await SessionStore.readAccountEmail();
    if (email == null || email.isEmpty) {
      if (_accountId == null && acc.isNotEmpty) {
        _accountId = _accountIdFromMap(acc.first);
      }
      return;
    }
    final tenantId = await SessionStore.readTenantId();
    final saved = await MailViewPreferences.load(email: email, tenantId: tenantId);
    if (saved.accountId != null &&
        acc.any((a) => _accountIdFromMap(a) == saved.accountId)) {
      _accountId = saved.accountId;
    } else if (_accountId == null && acc.isNotEmpty) {
      _accountId = _accountIdFromMap(acc.first);
    }
    _folder = saved.folder;
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
      await _applySavedMailView(acc);
      setState(() {
        _accounts = acc;
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
          await _applySavedMailView(acc);
          setState(() {
            _accounts = acc;
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

  String? _mailSearchQueryParam() {
    final t = _searchController.text.trim();
    if (t.length < 2) return null;
    return t.length > 200 ? t.substring(0, 200) : t;
  }

  void _onSearchFieldChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 450), () {
      if (!mounted) return;
      _reloadMessages();
    });
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
      final q = _mailSearchQueryParam();
      final page = await widget.session.api.fetchMailMessages(
        accessToken: widget.session.accessToken,
        accountId: id,
        folder: _folder,
        limit: 50,
        offset: 0,
        q: q,
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
          final q = _mailSearchQueryParam();
          final page = await widget.session.api.fetchMailMessages(
            accessToken: widget.session.accessToken,
            accountId: id,
            folder: _folder,
            limit: 50,
            offset: 0,
            q: q,
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
    _searchController.clear();
    setState(() => _accountId = newId);
    unawaited(_persistMailView());
    _reloadSummaryAndMessages();
  }

  void _onFolderChanged(String api) {
    if (_folder == api) return;
    _searchController.clear();
    setState(() => _folder = api);
    unawaited(_persistMailView());
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

  Future<void> _moveMessageToFolder(Map<String, dynamic> message, String folder, String label) async {
    final id = _accountId;
    if (id == null) return;
    final midRaw = message['id'];
    final mid = midRaw is int ? midRaw : int.tryParse(midRaw?.toString() ?? '');
    if (mid == null) return;
    try {
      await widget.session.refreshIfNeeded();
      await widget.session.api.patchMessageFolder(
        accessToken: widget.session.accessToken,
        accountId: id,
        messageId: mid,
        folder: folder,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Message déplacé vers $label')),
      );
      await _reloadSummaryAndMessages();
    } on AuthException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible de déplacer le message')),
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
    for (final f in mailSidebarStandardOrder) {
      if (f == _folder) return MailStandardFolders.labelFor(f);
    }
    return _folder;
  }

  String _messageDisplayDate(Map<String, dynamic> m) {
    final folder = m['folder']?.toString().trim().toLowerCase() ?? '';
    final scheduled = m['scheduled_send_at']?.toString();
    if (folder == MailStandardFolders.scheduled && scheduled != null && scheduled.isNotEmpty) {
      return formatCloudityDateTimeLocal(scheduled);
    }
    return formatCloudityDateTimeLocal(m['date_at']?.toString());
  }

  Future<void> _openImapPasswordScreen(Map<String, dynamic> acc) async {
    final rawId = acc['id'];
    final id = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
    if (id == null) return;
    final email = acc['email']?.toString() ?? '';
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => MailImapPasswordScreen(
          api: widget.session.api,
          accessToken: widget.session.accessToken,
          accountId: id,
          accountEmail: email,
          lastSyncError: acc['last_sync_error']?.toString(),
        ),
      ),
    );
    if (ok == true && mounted) {
      await _refreshAccountsFromServer();
      await _reloadSummaryAndMessages();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mot de passe enregistré — synchronisation relancée')),
      );
    }
  }

  Widget _buildSyncIssueBanner(Map<String, dynamic> acc) {
    final message = mailAccountSyncIssueMessage(acc);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Material(
        color: Colors.amber.shade100,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          leading: Icon(Icons.warning_amber_rounded, color: Colors.amber.shade900),
          title: Text(
            'Synchronisation interrompue',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.amber.shade900,
            ),
          ),
          subtitle: Text(
            message,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: TextButton(
            onPressed: () => _openImapPasswordScreen(acc),
            child: const Text('MDP IMAP'),
          ),
          dense: true,
        ),
      ),
    );
  }

  Widget _buildMessagesView() {
    final currentAccount = _accountById(_accountId);
    final showSyncBanner =
        currentAccount != null && mailAccountHasSyncIssue(currentAccount);
    return RefreshIndicator(
      onRefresh: () async {
        await _syncAllAccountsInBackground();
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
                if (showSyncBanner) _buildSyncIssueBanner(currentAccount),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Text('${_folderTitle()} ($_total)', style: Theme.of(context).textTheme.titleSmall),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Recherche (2+ car., FR+EN, tri pertinence)',
                      prefixIcon: const Icon(Icons.search, size: 22),
                      suffixIcon: _searchController.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                _searchDebounce?.cancel();
                                _reloadMessages();
                              },
                            ),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: _onSearchFieldChanged,
                  ),
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
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      clipBehavior: Clip.antiAlias,
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        title: Text(
                          sub,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.w600),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(from, maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(
                              _messageDisplayDate(m),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
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
                                } else if (value == 'move-spam') {
                                  _moveMessageToFolder(m, 'spam', 'Spam');
                                } else if (value == 'move-trash') {
                                  _moveMessageToFolder(m, 'trash', 'Corbeille');
                                } else if (value == 'move-archive') {
                                  _moveMessageToFolder(m, 'archive', 'Archive');
                                } else if (value == 'move-inbox') {
                                  _moveMessageToFolder(m, 'inbox', 'Réception');
                                }
                              },
                              itemBuilder: (ctx) => [
                                PopupMenuItem<String>(
                                  value: 'toggle-read',
                                  child: Text(isRead ? 'Marquer comme non lu' : 'Marquer comme lu'),
                                ),
                                const PopupMenuItem<String>(value: 'move-spam', child: Text('Signaler spam')),
                                const PopupMenuItem<String>(value: 'move-trash', child: Text('Mettre en corbeille')),
                                const PopupMenuItem<String>(value: 'move-archive', child: Text('Archiver')),
                                const PopupMenuItem<String>(value: 'move-inbox', child: Text('Déplacer vers réception')),
                              ],
                            ),
                          ],
                        ),
                        onTap: () => _openMessage(m),
                      ),
                    );
                  }),
              ],
            ),
    );
  }

  Widget _buildDrawer() {
    final extras = _extraFoldersFromSummary();
    final currentAccount = _accountById(_accountId);
    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: const Text('Compte Cloudity'),
              subtitle: Text(widget.session.api.baseUrl),
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text('Boîtes', style: Theme.of(context).textTheme.labelLarge),
            ),
            ..._accounts.map((a) {
              final rawId = a['id'];
              final aid = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
              if (aid == null) return const SizedBox.shrink();
              final label = mailAccountLabel(a) ?? a['email']?.toString() ?? '';
              final selected = _accountId == aid;
              final hasIssue = mailAccountHasSyncIssue(a);
              return ListTile(
                leading: Icon(
                  hasIssue ? Icons.warning_amber_rounded : Icons.mail_outline,
                  color: hasIssue ? Colors.amber.shade800 : null,
                ),
                title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                selected: selected,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _showSettings = false);
                  _onAccountChanged(aid);
                },
              );
            }),
            const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text('Dossiers', style: Theme.of(context).textTheme.labelLarge),
            ),
            ...mailSidebarStandardOrder.map((f) {
              final selected = !_showSettings && _folder == f;
              final unread = _unreadForFolder(f);
              return ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: Text(MailStandardFolders.labelFor(f)),
                selected: selected,
                trailing: unread > 0
                    ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11)))
                    : null,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _showSettings = false);
                  _onFolderChanged(f);
                },
              );
            }),
            ...extras.map((ex) {
              final path = ex['folder']?.toString() ?? '';
              if (path.isEmpty) return const SizedBox.shrink();
              final selected = !_showSettings && _folder == path;
              final u = ex['unread'];
              final unread = u is int ? u : (u is num ? u.toInt() : 0);
              return ListTile(
                leading: const Icon(Icons.folder_special_outlined),
                title: Text(path),
                selected: selected,
                trailing: unread > 0
                    ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11)))
                    : null,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _showSettings = false);
                  _onFolderChanged(path);
                },
              );
            }),
            if (currentAccount != null && mailAccountHasSyncIssue(currentAccount))
              ListTile(
                leading: Icon(Icons.vpn_key_outlined, color: Colors.amber.shade900),
                title: const Text('MDP IMAP'),
                subtitle: Text(
                  mailAccountSyncIssueMessage(currentAccount),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                onTap: () {
                  Navigator.pop(context);
                  _openImapPasswordScreen(currentAccount);
                },
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Paramètres'),
              selected: _showSettings,
              onTap: () {
                Navigator.pop(context);
                setState(() => _showSettings = true);
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Déconnexion'),
              onTap: () async {
                Navigator.pop(context);
                await _confirmLogout();
              },
            ),
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
        title: Text(_showSettings ? 'Paramètres' : _folderTitle()),
        actions: [
          if (!_showSettings)
            IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _reloadAccounts),
        ],
      ),
      drawer: _buildDrawer(),
      floatingActionButton: !_showSettings && _accountId != null
          ? FloatingActionButton.extended(
              key: const ValueKey('cloudity_mail_compose_open'),
              onPressed: _loading ? null : _openCompose,
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Nouveau'),
            )
          : null,
      body: _showSettings
          ? MailSettingsScreen(
              session: widget.session,
              accounts: _accounts,
              onAccountsChanged: _refreshAccountsFromServer,
            )
          : _buildMessagesView(),
    );
  }
}
