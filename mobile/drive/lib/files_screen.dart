import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'user_session.dart';

class FilesScreen extends StatefulWidget {
  const FilesScreen({super.key, required this.session, required this.onLogout});

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<FilesScreen> {
  /// Pile des `parent_id` ; `null` = racine.
  final List<int?> _parentStack = [null];
  final List<String> _folderNameStack = ['Mon Drive'];
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _actionBusy = false;
  double? _uploadProgress;
  String? _error;

  int? get _parentId => _parentStack.last;
  String get _folderTitle => _folderNameStack.last;
  String get _accountLabel => _accountFromToken(widget.session.accessToken);

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

  void _openFolder(int id, String name) {
    setState(() {
      _parentStack.add(id);
      _folderNameStack.add(name);
    });
    _reload();
  }

  void _goUp() {
    if (_parentStack.length <= 1) return;
    setState(() {
      _parentStack.removeLast();
      _folderNameStack.removeLast();
    });
    _reload();
  }

  void _goRoot() {
    Navigator.of(context).maybePop();
    setState(() {
      _parentStack
        ..clear()
        ..add(null);
      _folderNameStack
        ..clear()
        ..add('Mon Drive');
    });
    _reload();
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

  Future<void> _runDriveAction(Future<void> Function() action) async {
    setState(() {
      _actionBusy = true;
      _uploadProgress = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      await action();
      await _reload();
    } on AuthException catch (e) {
      if (!mounted) return;
      final message = e.message == 'non_autorisé'
          ? 'Session expirée. Reconnectez-vous.'
          : e.message;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Action Drive impossible : $e')));
    } finally {
      if (mounted) {
        setState(() {
          _actionBusy = false;
          _uploadProgress = null;
        });
      }
    }
  }

  Future<void> _showNewMenu() async {
    final action = await showModalBottomSheet<_DriveNewAction>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.create_new_folder_outlined),
                title: const Text('Créer un dossier'),
                subtitle: Text('Dans $_folderTitle'),
                onTap: () =>
                    Navigator.pop(context, _DriveNewAction.createFolder),
              ),
              ListTile(
                leading: const Icon(Icons.upload_file_outlined),
                title: const Text('Importer des fichiers'),
                subtitle: const Text('Sélection multiple, upload sécurisé'),
                onTap: () =>
                    Navigator.pop(context, _DriveNewAction.uploadFiles),
              ),
              ListTile(
                leading: const Icon(Icons.folder_copy_outlined),
                title: const Text('Importer un dossier'),
                subtitle: const Text(
                  'Android limite l’accès dossier complet ; utilisez une sélection multiple pour le moment.',
                ),
                onTap: () =>
                    Navigator.pop(context, _DriveNewAction.uploadFiles),
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case _DriveNewAction.createFolder:
        await _createFolder();
      case _DriveNewAction.uploadFiles:
        await _importFiles();
    }
  }

  Future<void> _createFolder() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nouveau dossier'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Nom du dossier',
            border: OutlineInputBorder(),
          ),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => Navigator.pop(context, ctrl.text.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, ctrl.text.trim()),
            child: const Text('Créer'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    final clean = name?.trim();
    if (clean == null || clean.isEmpty) return;
    await _runDriveAction(() async {
      await widget.session.api.createFolder(
        accessToken: widget.session.accessToken,
        name: clean,
        parentId: _parentId,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Dossier "$clean" créé.')));
    });
  }

  Future<void> _importFiles() async {
    final result = await FilePicker.pickFiles(
      allowMultiple: true,
      withData: false,
      lockParentWindow: true,
    );
    if (result == null || result.files.isEmpty) return;
    final files = result.files
        .where((f) => f.path != null && f.path!.trim().isNotEmpty)
        .toList();
    if (files.isEmpty) return;

    await _runDriveAction(() async {
      var done = 0;
      for (final picked in files) {
        final path = picked.path;
        if (path == null) continue;
        final file = File(path);
        final name = picked.name.trim().isEmpty
            ? path.split(Platform.pathSeparator).last
            : picked.name.trim();
        await widget.session.api.uploadFile(
          accessToken: widget.session.accessToken,
          file: file,
          fileName: name,
          parentId: _parentId,
          onProgress: (sent, total) {
            if (!mounted || total <= 0) return;
            setState(() {
              _uploadProgress = (done + (sent / total)) / files.length;
            });
          },
        );
        done++;
        if (mounted) {
          setState(() => _uploadProgress = done / files.length);
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${files.length} fichier(s) importé(s).')),
      );
    });
  }

  String _accountFromToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return 'Compte Cloudity';
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final map = jsonDecode(payload) as Map<String, dynamic>;
      final email = map['email']?.toString();
      if (email != null && email.contains('@')) return email;
      final sub = map['sub']?.toString();
      if (sub != null && sub.isNotEmpty) return sub;
      final uid = map['user_id']?.toString();
      if (uid != null && uid.isNotEmpty) return 'Utilisateur #$uid';
    } catch (_) {
      // Jeton opaque ou format inattendu : afficher un libellé neutre.
    }
    return 'Compte Cloudity';
  }

  String _initials(String label) {
    final clean = label.trim();
    if (clean.isEmpty) return 'C';
    final local = clean.split('@').first;
    final parts = local
        .split(RegExp(r'[\s._-]+'))
        .where((part) => part.trim().isNotEmpty)
        .toList();
    if (parts.isEmpty) return clean.characters.first.toUpperCase();
    return parts
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();
  }

  IconData _iconFor(Map<String, dynamic> node) {
    if (node['is_folder'] == true) return Icons.folder_rounded;
    final name = (node['name'] as String? ?? '').toLowerCase();
    final mime = (node['mime_type'] as String? ?? '').toLowerCase();
    if (mime.startsWith('image/') ||
        RegExp(r'\.(jpe?g|png|webp|gif|heic|heif|avif)$').hasMatch(name)) {
      return Icons.image_outlined;
    }
    if (mime == 'application/pdf' || name.endsWith('.pdf')) {
      return Icons.picture_as_pdf_outlined;
    }
    if (name.endsWith('.zip') ||
        name.endsWith('.tar') ||
        name.endsWith('.gz')) {
      return Icons.folder_zip_outlined;
    }
    return Icons.insert_drive_file_outlined;
  }

  Color _iconColor(BuildContext context, Map<String, dynamic> node) {
    final scheme = Theme.of(context).colorScheme;
    if (node['is_folder'] == true) return Colors.amber.shade700;
    final icon = _iconFor(node);
    if (icon == Icons.image_outlined) return Colors.green.shade700;
    if (icon == Icons.picture_as_pdf_outlined) return Colors.red.shade700;
    if (icon == Icons.folder_zip_outlined) return Colors.deepPurple.shade600;
    return scheme.primary;
  }

  String _sizeLabel(Map<String, dynamic> node) {
    if (node['is_folder'] == true) {
      final files = node['child_files'];
      final folders = node['child_folders'];
      if (files is num || folders is num) {
        return '${(folders as num?)?.toInt() ?? 0} dossier(s) · ${(files as num?)?.toInt() ?? 0} fichier(s)';
      }
      return 'Dossier';
    }
    final size = node['size'];
    if (size is! num || size <= 0) return 'Fichier';
    final bytes = size.toDouble();
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} Go';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} Ko';
    }
    return '${bytes.toStringAsFixed(0)} o';
  }

  String _dateLabel(Map<String, dynamic> node) {
    final raw = (node['updated_at'] ?? node['created_at'])?.toString();
    final date = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    if (date == null) return '';
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  Widget _accountAvatar({double radius = 18}) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: Theme.of(context).colorScheme.primaryContainer,
      foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
      child: Text(
        _initials(_accountLabel),
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: radius * 0.75),
      ),
    );
  }

  Widget _buildDrawer() {
    return NavigationDrawer(
      selectedIndex: 0,
      onDestinationSelected: (index) {
        if (index == 0) {
          _goRoot();
        } else {
          Navigator.of(context).maybePop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Section Drive bientôt disponible.')),
          );
        }
      },
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Row(
            children: [
              _accountAvatar(radius: 26),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cloudity Drive',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _accountLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const NavigationDrawerDestination(
          icon: Icon(Icons.drive_folder_upload_outlined),
          selectedIcon: Icon(Icons.drive_folder_upload),
          label: Text('Mon Drive'),
        ),
        const NavigationDrawerDestination(
          icon: Icon(Icons.schedule_outlined),
          label: Text('Récents'),
        ),
        const NavigationDrawerDestination(
          icon: Icon(Icons.people_alt_outlined),
          label: Text('Partagés'),
        ),
        const NavigationDrawerDestination(
          icon: Icon(Icons.star_border_outlined),
          label: Text('Favoris'),
        ),
        const NavigationDrawerDestination(
          icon: Icon(Icons.delete_outline),
          label: Text('Corbeille'),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 28, vertical: 8),
          child: Divider(),
        ),
        ListTile(
          leading: const Icon(Icons.refresh),
          title: const Text('Actualiser'),
          onTap: () {
            Navigator.of(context).maybePop();
            _reload();
          },
        ),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Déconnexion'),
          onTap: () {
            Navigator.of(context).maybePop();
            _confirmLogout();
          },
        ),
      ],
    );
  }

  Widget _buildTopPanel() {
    final folderCount = _items.where((e) => e['is_folder'] == true).length;
    final fileCount = _items.length - folderCount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(28),
            child: InkWell(
              borderRadius: BorderRadius.circular(28),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Recherche Drive bientôt disponible.'),
                  ),
                );
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search),
                    const SizedBox(width: 12),
                    const Expanded(child: Text('Rechercher dans Drive')),
                    _accountAvatar(radius: 16),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Text(
                  _folderTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Changer l’affichage',
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Affichage grille bientôt disponible.'),
                    ),
                  );
                },
                icon: const Icon(Icons.grid_view_outlined),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$folderCount dossier(s) · $fileCount fichier(s)',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          if (_parentStack.length > 1) ...[
            const SizedBox(height: 10),
            FilledButton.tonalIcon(
              onPressed: _goUp,
              icon: const Icon(Icons.arrow_upward),
              label: const Text('Dossier parent'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFileTile(Map<String, dynamic> node) {
    final name = node['name'] as String? ?? 'Sans nom';
    final id = node['id'] is num ? (node['id'] as num).toInt() : null;
    final isFolder = node['is_folder'] == true;
    final date = _dateLabel(node);
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      elevation: 0,
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: _iconColor(context, node).withValues(alpha: 0.14),
          foregroundColor: _iconColor(context, node),
          child: Icon(_iconFor(node)),
        ),
        title: Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          [
            _sizeLabel(node),
            if (date.isNotEmpty) 'Modifié le $date',
          ].join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: IconButton(
          tooltip: 'Plus d’options',
          icon: const Icon(Icons.more_vert),
          onPressed: () => _showNodeActions(node),
        ),
        onTap: isFolder && id != null ? () => _openFolder(id, name) : null,
      ),
    );
  }

  void _showNodeActions(Map<String, dynamic> node) {
    final name = node['name'] as String? ?? 'Élément';
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.info_outline),
                title: const Text('Informations'),
                subtitle: Text(_sizeLabel(node)),
              ),
              const ListTile(
                leading: Icon(Icons.drive_file_move_outline),
                title: Text('Déplacer'),
                subtitle: Text('Bientôt disponible'),
              ),
              const ListTile(
                leading: Icon(Icons.delete_outline),
                title: Text('Mettre à la corbeille'),
                subtitle: Text('Bientôt disponible'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView(
        children: [
          const SizedBox(height: 120),
          const Center(child: CircularProgressIndicator()),
          if (_actionBusy) ...[
            const SizedBox(height: 24),
            Center(child: Text(_busyLabel)),
          ],
        ],
      );
    }
    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _reload, child: const Text('Réessayer')),
        ],
      );
    }
    if (_items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          SizedBox(height: 80),
          Icon(Icons.folder_open_outlined, size: 56),
          SizedBox(height: 16),
          Text(
            'Ce dossier est vide.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 8),
          Text(
            'Utilisez le bouton Nouveau pour créer un dossier ou importer des fichiers.',
            textAlign: TextAlign.center,
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 96),
      itemCount: _items.length + 1,
      itemBuilder: (context, i) {
        if (i == 0) return _buildTopPanel();
        return _buildFileTile(_items[i - 1]);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_drive_files'),
      drawer: _buildDrawer(),
      appBar: AppBar(
        title: const Text('Drive'),
        centerTitle: false,
        leading: _parentStack.length > 1
            ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goUp)
            : null,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualiser',
            onPressed: _loading ? null : _reload,
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: _accountAvatar(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _actionBusy ? null : _showNewMenu,
        icon: _actionBusy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.add),
        label: Text(_actionBusy ? _busyLabel : 'Nouveau'),
      ),
      body: RefreshIndicator(onRefresh: _reload, child: _buildBody()),
    );
  }

  String get _busyLabel {
    final progress = _uploadProgress;
    if (progress == null) return 'Traitement...';
    return 'Import ${(progress.clamp(0, 1) * 100).round()} %';
  }
}

enum _DriveNewAction { createFolder, uploadFiles }
