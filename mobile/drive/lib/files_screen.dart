import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'user_session.dart';

class FilesScreen extends StatefulWidget {
  const FilesScreen({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<FilesScreen> {
  /// Pile des `parent_id` ; `null` = racine.
  final List<int?> _parentStack = [null];
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  int? get _parentId => _parentStack.last;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final raw = await widget.session.api.fetchDriveNodes(
        accessToken: widget.session.accessToken,
        parentId: _parentId,
      );
      if (!mounted) return;
      setState(() {
        _items = raw;
        _loading = false;
      });
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final raw = await widget.session.api.fetchDriveNodes(
            accessToken: widget.session.accessToken,
            parentId: _parentId,
          );
          if (!mounted) return;
          setState(() {
            _items = raw;
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

  void _openFolder(int id) {
    setState(() => _parentStack.add(id));
    _reload();
  }

  void _goUp() {
    if (_parentStack.length <= 1) return;
    setState(() => _parentStack.removeLast());
    _reload();
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
      key: const ValueKey('cloudity_drive_files'),
      appBar: AppBar(
        title: Text(_parentId == null ? 'Cloudity Drive' : 'Dossier #$_parentId'),
        leading: _parentStack.length > 1
            ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goUp)
            : null,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _reload),
          IconButton(icon: const Icon(Icons.logout), onPressed: _confirmLogout),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: _loading
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _reload, child: const Text('Réessayer')),
                    ],
                  )
                : _items.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(24),
                        children: const [
                          SizedBox(height: 80),
                          Text('Dossier vide.'),
                        ],
                      )
                    : ListView.builder(
                        itemCount: _items.length,
                        itemBuilder: (context, i) {
                          final o = _items[i];
                          final name = o['name'] as String? ?? '?';
                          final id = o['id'] as int?;
                          final isFolder = o['is_folder'] == true;
                          return ListTile(
                            leading: Icon(isFolder ? Icons.folder_outlined : Icons.insert_drive_file_outlined),
                            title: Text(name),
                            subtitle: id != null ? Text('id: $id') : null,
                            onTap: isFolder && id != null ? () => _openFolder(id) : null,
                          );
                        },
                      ),
      ),
    );
  }
}
