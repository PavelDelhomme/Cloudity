import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:cloudity_shared/storage_usage.dart';

import 'auth_api.dart';
import 'drive_file_preview.dart';
import 'drive_folder_picker.dart';
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
  _DriveSection _section = _DriveSection.home;
  _ListLayout _layout = _ListLayout.list;
  String _searchQuery = '';
  List<Map<String, dynamic>> _searchResults = [];
  bool _searchLoading = false;
  StorageUsageSummary? _storageUsage;
  bool _storageLoading = false;
  String? _storageError;

  int? get _parentId => _parentStack.last;
  String get _folderTitle => switch (_section) {
    _DriveSection.trash => 'Corbeille',
    _DriveSection.recent => 'Récents',
    _DriveSection.home => _folderNameStack.last,
  };
  bool get _isTrashView => _section == _DriveSection.trash;
  bool get _isRecentView => _section == _DriveSection.recent;
  bool get _showFab => _section == _DriveSection.home;
  bool get _isSearchActive => _searchQuery.trim().isNotEmpty;
  List<Map<String, dynamic>> get _visibleItems =>
      _isSearchActive ? _searchResults : _items;
  String get _accountLabel => _accountFromToken(widget.session.accessToken);

  @override
  void initState() {
    super.initState();
    _reload();
    _loadStorageUsage();
  }

  Future<void> _loadStorageUsage() async {
    setState(() {
      _storageLoading = true;
      _storageError = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final usage = await fetchStorageUsage(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      if (!mounted) return;
      setState(() {
        _storageUsage = usage;
        _storageLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _storageError = e.toString();
        _storageLoading = false;
      });
    }
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final raw = switch (_section) {
        _DriveSection.trash => await widget.session.api.fetchDriveTrash(
          accessToken: widget.session.accessToken,
        ),
        _DriveSection.recent => await widget.session.api.fetchDriveRecent(
          accessToken: widget.session.accessToken,
        ),
        _DriveSection.home => await widget.session.api.fetchDriveNodes(
          accessToken: widget.session.accessToken,
          parentId: _parentId,
        ),
      };
      if (!mounted) return;
      setState(() {
        _items = raw;
        _loading = false;
      });
      if (_isSearchActive) {
        await _runSearch(_searchQuery, showLoading: false);
      }
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final raw = switch (_section) {
            _DriveSection.trash => await widget.session.api.fetchDriveTrash(
              accessToken: widget.session.accessToken,
            ),
            _DriveSection.recent => await widget.session.api.fetchDriveRecent(
              accessToken: widget.session.accessToken,
            ),
            _DriveSection.home => await widget.session.api.fetchDriveNodes(
              accessToken: widget.session.accessToken,
              parentId: _parentId,
            ),
          };
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
      _section = _DriveSection.home;
      _searchQuery = '';
      _searchResults = [];
      _parentStack
        ..clear()
        ..add(null);
      _folderNameStack
        ..clear()
        ..add('Mon Drive');
    });
    _reload();
  }

  void _openTrash() {
    Navigator.of(context).maybePop();
    setState(() {
      _section = _DriveSection.trash;
      _searchQuery = '';
      _searchResults = [];
      _parentStack
        ..clear()
        ..add(null);
      _folderNameStack
        ..clear()
        ..add('Mon Drive');
    });
    _reload();
  }

  void _openRecent() {
    Navigator.of(context).maybePop();
    setState(() {
      _section = _DriveSection.recent;
      _searchQuery = '';
      _searchResults = [];
      _parentStack
        ..clear()
        ..add(null);
      _folderNameStack
        ..clear()
        ..add('Mon Drive');
    });
    _reload();
  }

  Future<void> _runSearch(String query, {bool showLoading = true}) async {
    final q = query.trim();
    if (q.isEmpty) {
      if (!mounted) return;
      setState(() {
        _searchQuery = '';
        _searchResults = [];
        _searchLoading = false;
      });
      return;
    }
    if (showLoading) {
      setState(() {
        _searchQuery = q;
        _searchLoading = true;
      });
    } else {
      setState(() => _searchQuery = q);
    }
    try {
      await widget.session.refreshIfNeeded();
      final raw = await widget.session.api.searchDriveNodes(
        accessToken: widget.session.accessToken,
        query: q,
        parentId: _section == _DriveSection.home ? _parentId : null,
      );
      if (!mounted) return;
      setState(() {
        _searchResults = raw;
        _searchLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _searchLoading = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Recherche impossible : $e')));
    }
  }

  Future<void> _openSearch() async {
    final ctrl = TextEditingController(text: _searchQuery);
    final submitted = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rechercher dans Drive'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Nom de fichier ou dossier',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.search),
          ),
          textInputAction: TextInputAction.search,
          onSubmitted: (value) => Navigator.pop(context, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, ''),
            child: const Text('Effacer'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, ctrl.text),
            child: const Text('Rechercher'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (!mounted || submitted == null) return;
    await _runSearch(submitted);
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
                  'Sélection SAF Android — structure des sous-dossiers conservée',
                ),
                onTap: () =>
                    Navigator.pop(context, _DriveNewAction.uploadFolder),
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
      case _DriveNewAction.uploadFolder:
        await _importFolder();
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

  Future<void> _importFolder() async {
    final dirPath = await FilePicker.getDirectoryPath(
      dialogTitle: 'Choisir un dossier à importer',
    );
    if (dirPath == null || dirPath.trim().isEmpty) return;
    final root = Directory(dirPath);
    if (!await root.exists()) return;

    final entries = <({File file, String relativePath})>[];
    await for (final entity in root.list(recursive: true, followLinks: false)) {
      if (entity is! File) continue;
      final rel = entity.path.length <= dirPath.length
          ? entity.path.split(Platform.pathSeparator).last
          : entity.path.substring(dirPath.length + 1);
      if (rel.trim().isEmpty) continue;
      entries.add((file: entity, relativePath: rel));
    }
    if (entries.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Le dossier sélectionné est vide.')),
      );
      return;
    }

    await _runDriveAction(() async {
      final folderCache = <String, int?>{'': _parentId};
      var done = 0;
      for (final entry in entries) {
        final parts = entry.relativePath.split(Platform.pathSeparator);
        final fileName = parts.removeLast();
        final dirKey = parts.join(Platform.pathSeparator);
        final targetParent = await _ensureFolderPath(
          dirKey,
          _parentId,
          folderCache,
        );
        await widget.session.api.uploadFile(
          accessToken: widget.session.accessToken,
          file: entry.file,
          fileName: fileName,
          parentId: targetParent,
          onProgress: (sent, total) {
            if (!mounted || total <= 0) return;
            setState(() {
              _uploadProgress = (done + (sent / total)) / entries.length;
            });
          },
        );
        done++;
        if (mounted) {
          setState(() => _uploadProgress = done / entries.length);
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${entries.length} fichier(s) importé(s) depuis le dossier.',
          ),
        ),
      );
    });
  }

  Future<int?> _ensureFolderPath(
    String relativeDir,
    int? baseParentId,
    Map<String, int?> cache,
  ) async {
    final key = relativeDir.trim();
    if (key.isEmpty) return baseParentId;
    if (cache.containsKey(key)) return cache[key];

    final parts = key.split(Platform.pathSeparator);
    var currentKey = '';
    int? parent = baseParentId;
    for (final part in parts) {
      if (part.trim().isEmpty) continue;
      currentKey = currentKey.isEmpty
          ? part
          : '$currentKey${Platform.pathSeparator}$part';
      if (cache.containsKey(currentKey)) {
        parent = cache[currentKey];
        continue;
      }
      parent = await _findOrCreateFolder(part, parent);
      cache[currentKey] = parent;
    }
    return parent;
  }

  Future<int?> _findOrCreateFolder(String name, int? parentId) async {
    try {
      final created = await widget.session.api.createFolder(
        accessToken: widget.session.accessToken,
        name: name,
        parentId: parentId,
      );
      final id = created['id'];
      return id is num ? id.toInt() : null;
    } on AuthException {
      final siblings = await widget.session.api.fetchDriveNodes(
        accessToken: widget.session.accessToken,
        parentId: parentId,
      );
      for (final node in siblings) {
        if (node['is_folder'] == true && node['name']?.toString() == name) {
          final id = node['id'];
          if (id is num) return id.toInt();
        }
      }
      rethrow;
    }
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
    final raw = _isTrashView
        ? (node['deleted_at'] ?? node['updated_at'] ?? node['created_at'])
        : (node['updated_at'] ?? node['created_at']);
    final date = raw?.toString();
    final parsed = date == null ? null : DateTime.tryParse(date)?.toLocal();
    if (parsed == null) return '';
    return '${parsed.day.toString().padLeft(2, '0')}/${parsed.month.toString().padLeft(2, '0')}/${parsed.year}';
  }

  String _parentPathLabel(Map<String, dynamic> node) {
    final parentName = node['parent_name']?.toString();
    if (parentName != null && parentName.isNotEmpty) {
      return parentName;
    }
    final parentId = node['parent_id'];
    if (parentId == null) return 'Racine';
    return 'Dossier #$parentId';
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
    final selectedIndex = switch (_section) {
      _DriveSection.home => 0,
      _DriveSection.recent => 1,
      _DriveSection.trash => 4,
    };
    return NavigationDrawer(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index == 0) {
          _goRoot();
        } else if (index == 1) {
          _openRecent();
        } else if (index == 4) {
          _openTrash();
        } else {
          Navigator.of(context).maybePop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Partagés et favoris arrivent avec le partage Drive côté serveur.',
              ),
            ),
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
        Padding(
          padding: const EdgeInsets.fromLTRB(28, 4, 28, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.storage_outlined,
                    size: 20,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Espace utilisé',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const Spacer(),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.refresh, size: 20),
                    onPressed: _storageLoading ? null : _loadStorageUsage,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              if (_storageLoading)
                Text(
                  'Calcul en cours…',
                  style: Theme.of(context).textTheme.bodySmall,
                )
              else if (_storageError != null)
                Text(
                  _storageError!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                )
              else if (_storageUsage == null)
                Text(
                  'Indisponible',
                  style: Theme.of(context).textTheme.bodySmall,
                )
              else ...[
                Text(
                  'Photos ${formatStorageBytes(_storageUsage!.photos.bytes)} · '
                  'Drive ${formatStorageBytes(_storageUsage!.drive.bytes)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (_storageUsage!.mailNote != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _storageUsage!.mailNote!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ],
          ),
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
    final folderCount = _visibleItems
        .where((e) => e['is_folder'] == true)
        .length;
    final fileCount = _visibleItems.length - folderCount;
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
              onTap: _openSearch,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _isSearchActive
                            ? 'Recherche : $_searchQuery'
                            : 'Rechercher dans Drive',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (_isSearchActive)
                      IconButton(
                        tooltip: 'Effacer la recherche',
                        onPressed: () => _runSearch(''),
                        icon: const Icon(Icons.close, size: 20),
                      ),
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
                tooltip: _layout == _ListLayout.list
                    ? 'Affichage grille'
                    : 'Affichage liste',
                onPressed: () {
                  setState(() {
                    _layout = _layout == _ListLayout.list
                        ? _ListLayout.grid
                        : _ListLayout.list;
                  });
                },
                icon: Icon(
                  _layout == _ListLayout.list
                      ? Icons.grid_view_outlined
                      : Icons.view_list_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _isSearchActive
                ? '${_visibleItems.length} résultat(s)'
                : _isRecentView
                ? '${_visibleItems.length} élément(s) récent(s)'
                : '$folderCount dossier(s) · $fileCount fichier(s)',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          if (_searchLoading) ...[
            const SizedBox(height: 10),
            const LinearProgressIndicator(),
          ],
          if (_section == _DriveSection.home && _parentStack.length > 1) ...[
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
            if (_isSearchActive || _isRecentView) _parentPathLabel(node),
            _sizeLabel(node),
            if (date.isNotEmpty)
              _isTrashView ? 'Supprimé le $date' : 'Modifié le $date',
          ].where((part) => part.isNotEmpty).join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: IconButton(
          tooltip: 'Plus d’options',
          icon: const Icon(Icons.more_vert),
          onPressed: () => _showNodeActions(node),
        ),
        onTap: () => _onNodeTap(node, id, name, isFolder),
      ),
    );
  }

  void _onNodeTap(
    Map<String, dynamic> node,
    int? id,
    String name,
    bool isFolder,
  ) {
    if (_isTrashView) {
      _showNodeActions(node);
      return;
    }
    if (_isRecentView && isFolder && id != null) {
      setState(() {
        _section = _DriveSection.home;
        _searchQuery = '';
        _searchResults = [];
        _parentStack
          ..clear()
          ..add(null)
          ..add(id);
        _folderNameStack
          ..clear()
          ..add('Mon Drive')
          ..add(name);
      });
      _reload();
      return;
    }
    if (_isSearchActive && isFolder && id != null) {
      setState(() {
        _searchQuery = '';
        _searchResults = [];
        _section = _DriveSection.home;
        _parentStack
          ..clear()
          ..add(null)
          ..add(id);
        _folderNameStack
          ..clear()
          ..add('Mon Drive')
          ..add(name);
      });
      _reload();
      return;
    }
    if (isFolder && id != null) {
      _openFolder(id, name);
      return;
    }
    if (!isFolder && id != null) {
      _openFilePreview(node);
    }
  }

  Future<void> _openFilePreview(Map<String, dynamic> node) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            DriveFilePreviewPage(session: widget.session, node: node),
      ),
    );
  }

  void _showNodeActions(Map<String, dynamic> node) {
    final name = node['name'] as String? ?? 'Élément';
    final id = node['id'] is num ? (node['id'] as num).toInt() : null;
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
              if (_isTrashView && id != null) ...[
                ListTile(
                  leading: const Icon(Icons.restore_outlined),
                  title: const Text('Restaurer'),
                  onTap: () {
                    Navigator.pop(context);
                    _restoreNode(id, name);
                  },
                ),
                ListTile(
                  leading: Icon(
                    Icons.delete_forever_outlined,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  title: Text(
                    'Supprimer définitivement',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _purgeNode(id, name);
                  },
                ),
              ] else if (id != null) ...[
                if (node['is_folder'] != true)
                  ListTile(
                    leading: const Icon(Icons.visibility_outlined),
                    title: const Text('Ouvrir / prévisualiser'),
                    onTap: () {
                      Navigator.pop(context);
                      _openFilePreview(node);
                    },
                  ),
                ListTile(
                  leading: const Icon(Icons.drive_file_move_outline),
                  title: const Text('Déplacer'),
                  onTap: () {
                    Navigator.pop(context);
                    _moveNode(id, name, node['is_folder'] == true);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.delete_outline),
                  title: const Text('Mettre à la corbeille'),
                  onTap: () {
                    Navigator.pop(context);
                    _deleteNode(id, name);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _moveNode(int id, String name, bool isFolder) async {
    final pick = await showDriveFolderPicker(
      context,
      session: widget.session,
      title: 'Déplacer « $name »',
      excludeNodeId: isFolder ? id : null,
    );
    if (pick == null || !mounted) return;
    await _runDriveAction(() async {
      await widget.session.api.moveDriveNode(
        accessToken: widget.session.accessToken,
        nodeId: id,
        parentId: pick.parentId,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('« $name » déplacé.')));
    });
  }

  Future<void> _deleteNode(int id, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mettre à la corbeille'),
        content: Text('Déplacer « $name » vers la corbeille ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Corbeille'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _runDriveAction(() async {
      await widget.session.api.deleteDriveNode(
        accessToken: widget.session.accessToken,
        nodeId: id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('« $name » déplacé vers la corbeille.')),
      );
    });
  }

  Future<void> _restoreNode(int id, String name) async {
    await _runDriveAction(() async {
      await widget.session.api.restoreDriveNode(
        accessToken: widget.session.accessToken,
        nodeId: id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('« $name » restauré.')));
    });
  }

  Future<void> _purgeNode(int id, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Suppression définitive'),
        content: Text(
          'Supprimer définitivement « $name » ? Cette action est irréversible.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _runDriveAction(() async {
      await widget.session.api.purgeDriveNode(
        accessToken: widget.session.accessToken,
        nodeId: id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('« $name » supprimé définitivement.')),
      );
    });
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
    if (_visibleItems.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 80),
          Icon(
            _isTrashView
                ? Icons.delete_outline
                : _isRecentView
                ? Icons.schedule_outlined
                : _isSearchActive
                ? Icons.search_off_outlined
                : Icons.folder_open_outlined,
            size: 56,
          ),
          const SizedBox(height: 16),
          Text(
            _isTrashView
                ? 'La corbeille est vide.'
                : _isRecentView
                ? 'Aucun fichier récent.'
                : _isSearchActive
                ? 'Aucun résultat pour cette recherche.'
                : 'Ce dossier est vide.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            _isTrashView
                ? 'Les éléments supprimés apparaîtront ici.'
                : _isRecentView
                ? 'Les fichiers modifiés récemment s’afficheront ici.'
                : _isSearchActive
                ? 'Essayez un autre nom de fichier ou dossier.'
                : 'Utilisez le bouton Nouveau pour créer un dossier ou importer des fichiers.',
            textAlign: TextAlign.center,
          ),
        ],
      );
    }
    if (_layout == _ListLayout.grid) {
      return CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildTopPanel()),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 96),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 0.92,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, i) => _buildGridTile(_visibleItems[i]),
                childCount: _visibleItems.length,
              ),
            ),
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 96),
      itemCount: _visibleItems.length + 1,
      itemBuilder: (context, i) {
        if (i == 0) return _buildTopPanel();
        return _buildFileTile(_visibleItems[i - 1]);
      },
    );
  }

  Widget _buildGridTile(Map<String, dynamic> node) {
    final name = node['name'] as String? ?? 'Sans nom';
    final id = node['id'] is num ? (node['id'] as num).toInt() : null;
    final isFolder = node['is_folder'] == true;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _onNodeTap(node, id, name, isFolder),
        onLongPress: () => _showNodeActions(node),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: _iconColor(
                  context,
                  node,
                ).withValues(alpha: 0.14),
                foregroundColor: _iconColor(context, node),
                child: Icon(_iconFor(node)),
              ),
              const SizedBox(height: 10),
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                _sizeLabel(node),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
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
      floatingActionButton: !_showFab
          ? null
          : FloatingActionButton.extended(
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

enum _DriveSection { home, recent, trash }

enum _ListLayout { list, grid }

enum _DriveNewAction { createFolder, uploadFiles, uploadFolder }
