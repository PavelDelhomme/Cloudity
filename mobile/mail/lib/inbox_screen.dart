import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'user_session.dart';

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

  @override
  void initState() {
    super.initState();
    _reloadAccounts();
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
        await _reloadMessages();
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
          if (_accountId != null) await _reloadMessages();
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
        folder: 'inbox',
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
            folder: 'inbox',
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_inbox'),
      appBar: AppBar(
        title: const Text('Cloudity Mail'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _reloadAccounts),
          IconButton(icon: const Icon(Icons.logout), onPressed: _confirmLogout),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reloadAccounts,
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
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                        children: [
                          if (_accounts.length > 1)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                              child: Text(
                                'Plusieurs boîtes : affichage de la première (${_accounts.first['email']}). '
                                'Changement de boîte : prochaine version.',
                                style: Theme.of(context).textTheme.bodySmall,
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
                          else ...[
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              child: Text(
                                'Boîte de réception ($_total)',
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                            ),
                            ..._messages.map((m) {
                              final sub = m['subject']?.toString() ?? '(sans objet)';
                              final from = m['from']?.toString() ?? '';
                              return ListTile(
                                title: Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis),
                                subtitle: Text(from, maxLines: 1, overflow: TextOverflow.ellipsis),
                              );
                            }),
                          ],
                        ],
                      ),
      ),
    );
  }
}
