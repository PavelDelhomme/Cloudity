import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';

import 'auth_api.dart';
import 'package:cloudity_shared/http_helpers.dart';
import 'drive_api.dart';
import 'gallery_sync_settings_sheet.dart';
import 'gallery_sync_prefs.dart';
import 'photo_load_queue.dart';
import 'user_session.dart';

const _pageSize = 48;

enum _PhotosTab { timeline, albums, archive, trash, locked, settings }

const _monthsFr = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

String _dayKeyFromItem(Map<String, dynamic> o) {
  final iso =
      (o['taken_at'] ?? o['created_at'] ?? o['updated_at'])?.toString() ?? '';
  if (iso.isEmpty) return 'unknown';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return 'unknown';
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String _headingForDayKey(String dayKey, String sampleIso) {
  if (dayKey == 'unknown') return 'Date inconnue';
  final d = DateTime.tryParse(sampleIso)?.toLocal();
  if (d == null) return dayKey;
  final now = DateTime.now();
  final t0 = DateTime(now.year, now.month, now.day);
  final t1 = DateTime(d.year, d.month, d.day);
  final diff = t0.difference(t1).inDays;
  if (diff == 0) return 'Aujourd’hui';
  if (diff == 1) return 'Hier';
  return '${d.day} ${_monthsFr[d.month - 1]} ${d.year}';
}

List<({String dayKey, String heading, List<Map<String, dynamic>> items})>
_groupByDay(List<Map<String, dynamic>> flat) {
  final out =
      <({String dayKey, String heading, List<Map<String, dynamic>> items})>[];
  for (final o in flat) {
    final dk = _dayKeyFromItem(o);
    final iso =
        (o['taken_at'] ?? o['created_at'] ?? o['updated_at'])?.toString() ?? '';
    if (out.isNotEmpty && out.last.dayKey == dk) {
      out.last.items.add(o);
    } else {
      out.add((dayKey: dk, heading: _headingForDayKey(dk, iso), items: [o]));
    }
  }
  return out;
}

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen>
    with WidgetsBindingObserver {
  final List<Map<String, dynamic>> _items = [];
  Timer? _refreshTimer;
  int _offset = 0;
  bool _hasMore = true;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  _PhotosTab _tab = _PhotosTab.timeline;
  bool _albumsLoading = false;
  String? _albumsError;
  List<Map<String, dynamic>> _rootFolders = [];
  Map<String, dynamic>? _selectedAlbum;
  List<Map<String, dynamic>> _albumItems = [];
  bool _trashLoading = false;
  String? _trashError;
  List<Map<String, dynamic>> _trashItems = [];
  bool _lockedUnlocked = false;
  String? _lockedError;
  bool _backupEnabled = false;
  bool _backupPendingWork = false;
  GallerySyncLastRun? _backupLastRun;
  Set<String> _backupAlbumIds = {};
  bool _selectionMode = false;
  final Set<int> _selectedIds = {};
  final Map<int, GlobalKey> _photoKeys = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadBackupStatus();
    _reload();
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!mounted || _loading || _tab != _PhotosTab.timeline) return;
      _loadBackupStatus();
      _reload(silent: true);
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadBackupStatus();
      _reload(silent: true);
      return;
    }
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      if (_lockedUnlocked) {
        setState(() => _lockedUnlocked = false);
      }
    }
  }

  Future<void> _loadBackupStatus() async {
    final enabled = await GallerySyncPrefs.isBackupEnabled();
    final albumIds = await GallerySyncPrefs.selectedAlbumIds();
    final pendingWork = await GallerySyncPrefs.hasPendingWork();
    final lastRun = await GallerySyncPrefs.lastRun();
    if (!mounted) return;
    setState(() {
      _backupEnabled = enabled;
      _backupAlbumIds = albumIds;
      _backupPendingWork = pendingWork;
      _backupLastRun = lastRun;
    });
  }

  String get _backupTargetLabel {
    if (_backupAlbumIds.isEmpty) {
      return 'Toutes les photos, dont Appareil photo';
    }
    if (_backupAlbumIds.length == 1) return '1 dossier sélectionné';
    return '${_backupAlbumIds.length} dossiers sélectionnés';
  }

  IconData get _backupIcon {
    if (_backupEnabled && _backupPendingWork) return Icons.cloud_sync_outlined;
    return _backupEnabled
        ? Icons.cloud_done_outlined
        : Icons.cloud_off_outlined;
  }

  String get _backupTooltip {
    if (_backupEnabled && _backupPendingWork) {
      return 'Sauvegarde Photos : suite planifiée en arrière-plan';
    }
    return _backupEnabled
        ? 'Synchronisation active : $_backupTargetLabel'
        : 'Synchronisation désactivée';
  }

  String get _backupStatusSummary {
    if (!_backupEnabled) return 'Aucune photo ne sera envoyée automatiquement.';
    if (_backupPendingWork) {
      return 'Suite planifiée en arrière-plan · $_backupTargetLabel';
    }
    final run = _backupLastRun;
    if (run?.failed == true) return 'Dernier passage : ${run!.error}';
    if (run != null) {
      return '${run.uploaded} envoyée(s), ${run.skipped} déjà à jour/ignorée(s) · $_backupTargetLabel';
    }
    return _backupTargetLabel;
  }

  Future<void> _reload({bool silent = false}) async {
    setState(() {
      _error = null;
      if (!silent || _items.isEmpty) {
        _loading = true;
      }
      _offset = 0;
      _hasMore = true;
    });
    await _fetchPage(
      reset: true,
      preserveExisting: silent && _items.isNotEmpty,
    );
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchPage({
    required bool reset,
    bool preserveExisting = false,
  }) async {
    try {
      await widget.session.refreshIfNeeded();
      final data = await widget.session.api.fetchTimelinePage(
        accessToken: widget.session.accessToken,
        limit: _pageSize,
        offset: reset ? 0 : _offset,
      );
      final itemsVal = data['items'];
      final raw = itemsVal is List
          ? itemsVal
                .cast<dynamic>()
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList()
          : <Map<String, dynamic>>[];
      final photos = raw.where(_isPhotoNode).toList();
      final more = data['has_more'] == true;
      if (!mounted) return;
      setState(() {
        if (reset) {
          if (!preserveExisting || photos.isNotEmpty) {
            _items
              ..clear()
              ..addAll(photos);
          }
          _offset = raw.length;
        } else {
          _items.addAll(photos);
          _offset += raw.length;
        }
        _hasMore = more;
        _error = null;
      });
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final data = await widget.session.api.fetchTimelinePage(
            accessToken: widget.session.accessToken,
            limit: _pageSize,
            offset: reset ? 0 : _offset,
          );
          final itemsVal = data['items'];
          final raw = itemsVal is List
              ? itemsVal
                    .cast<dynamic>()
                    .map((e) => Map<String, dynamic>.from(e as Map))
                    .toList()
              : <Map<String, dynamic>>[];
          final photos = raw.where(_isPhotoNode).toList();
          if (!mounted) return;
          setState(() {
            if (reset) {
              if (!preserveExisting || photos.isNotEmpty) {
                _items
                  ..clear()
                  ..addAll(photos);
              }
              _offset = raw.length;
            } else {
              _items.addAll(photos);
              _offset += raw.length;
            }
            _hasMore = data['has_more'] == true;
          });
          return;
        } catch (_) {
          if (mounted) {
            setState(
              () => _error =
                  'Session expirée. Déconnectez-vous et reconnectez-vous.',
            );
          }
        }
      } else {
        if (mounted) setState(() => _error = e.message);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    await _fetchPage(reset: false);
    if (mounted) setState(() => _loadingMore = false);
  }

  void _setTab(_PhotosTab tab) {
    setState(() {
      _tab = tab;
      _selectionMode = false;
      _selectedIds.clear();
    });
    if (tab == _PhotosTab.albums && _rootFolders.isEmpty && !_albumsLoading) {
      _loadAlbums();
    }
    if (tab == _PhotosTab.trash && _trashItems.isEmpty && !_trashLoading) {
      _loadTrash();
    }
    if (tab != _PhotosTab.locked && _lockedUnlocked) {
      setState(() => _lockedUnlocked = false);
    }
  }

  Future<void> _openBackupSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => const GallerySyncSettingsSheet(),
    );
    if (!mounted) return;
    await _loadBackupStatus();
    await _reload();
  }

  Future<void> _loadAlbums() async {
    setState(() {
      _albumsLoading = true;
      _albumsError = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final drive = DriveApi(widget.session.api.baseUrl);
      final nodes = await drive.fetchNodes(widget.session.accessToken, null);
      if (!mounted) return;
      setState(() {
        _rootFolders = nodes.where((n) => n['is_folder'] == true).toList();
        _albumsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _albumsError = e.toString();
        _albumsLoading = false;
      });
    }
  }

  Future<void> _openAlbum(Map<String, dynamic> album) async {
    setState(() {
      _selectedAlbum = album;
      _albumItems = [];
      _albumsLoading = true;
      _albumsError = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final drive = DriveApi(widget.session.api.baseUrl);
      final id = (album['id'] as num).toInt();
      final nodes = await drive.fetchNodes(widget.session.accessToken, id);
      if (!mounted) return;
      setState(() {
        _albumItems = nodes.where(_isPhotoNode).toList();
        _albumsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _albumsError = e.toString();
        _albumsLoading = false;
      });
    }
  }

  void _closeAlbum() {
    setState(() {
      _selectedAlbum = null;
      _albumItems = [];
      _albumsError = null;
    });
  }

  Future<void> _loadTrash() async {
    setState(() {
      _trashLoading = true;
      _trashError = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final drive = DriveApi(widget.session.api.baseUrl);
      final nodes = await drive.fetchTrash(widget.session.accessToken);
      if (!mounted) return;
      setState(() {
        _trashItems = nodes.where(_isPhotoNode).toList();
        _trashLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _trashError = e.toString();
        _trashLoading = false;
      });
    }
  }

  Future<void> _deletePhoto(Map<String, dynamic> item) async {
    final id = item['id'] is num ? (item['id'] as num).toInt() : null;
    if (id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mettre à la corbeille ?'),
        content: const Text(
          'La photo sera retirée de Cloudity Photos et restaurable depuis la corbeille. '
          'La photo locale du téléphone n’est pas supprimée.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Mettre à la corbeille'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await widget.session.refreshIfNeeded();
      await DriveApi(
        widget.session.api.baseUrl,
      ).deleteNode(widget.session.accessToken, id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Photo déplacée dans la corbeille.')),
      );
      await _reload();
      if (_selectedAlbum != null) {
        await _openAlbum(_selectedAlbum!);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Suppression impossible : $e')));
    }
  }

  Future<void> _restorePhoto(Map<String, dynamic> item) async {
    final id = item['id'] is num ? (item['id'] as num).toInt() : null;
    if (id == null) return;
    try {
      await widget.session.refreshIfNeeded();
      await DriveApi(
        widget.session.api.baseUrl,
      ).restoreNode(widget.session.accessToken, id);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Photo restaurée.')));
      await _loadTrash();
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Restauration impossible : $e')));
    }
  }

  int? _itemId(Map<String, dynamic> item) {
    return item['id'] is num ? (item['id'] as num).toInt() : null;
  }

  void _clearSelection() {
    setState(() {
      _selectionMode = false;
      _selectedIds.clear();
    });
  }

  void _toggleSelected(Map<String, dynamic> item) {
    final id = _itemId(item);
    if (id == null) return;
    setState(() {
      _selectionMode = true;
      if (!_selectedIds.add(id)) {
        _selectedIds.remove(id);
      }
      if (_selectedIds.isEmpty) _selectionMode = false;
    });
  }

  void _selectItems(Iterable<Map<String, dynamic>> items) {
    final ids = items.map(_itemId).whereType<int>();
    setState(() {
      _selectionMode = true;
      _selectedIds.addAll(ids);
      if (_selectedIds.isEmpty) _selectionMode = false;
    });
  }

  bool _sectionAllSelected(Iterable<Map<String, dynamic>> items) {
    final ids = items.map(_itemId).whereType<int>().toList();
    return ids.isNotEmpty && ids.every(_selectedIds.contains);
  }

  void _toggleSectionSelection(Iterable<Map<String, dynamic>> items) {
    if (_sectionAllSelected(items)) {
      final ids = items.map(_itemId).whereType<int>();
      setState(() {
        for (final id in ids) {
          _selectedIds.remove(id);
        }
        if (_selectedIds.isEmpty) {
          _selectionMode = false;
        }
      });
      return;
    }
    _selectItems(items);
  }

  List<Map<String, dynamic>> get _timelinePhotos =>
      _items.where(_isPhotoNode).toList();

  void _scrollToPhotoId(int? photoId) {
    if (photoId == null) return;
    final key = _photoKeys[photoId];
    final ctx = key?.currentContext;
    if (ctx == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 280),
        alignment: 0.2,
      );
    });
  }

  Future<void> _deleteSelected() async {
    final ids = _selectedIds.toList();
    if (ids.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Mettre ${ids.length} photo(s) à la corbeille ?'),
        content: const Text(
          'Les photos seront retirées de Cloudity Photos et restaurables depuis la corbeille. '
          'Les fichiers locaux du téléphone ne seront pas supprimés.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Mettre à la corbeille'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await widget.session.refreshIfNeeded();
      final drive = DriveApi(widget.session.api.baseUrl);
      for (final id in ids) {
        await drive.deleteNode(widget.session.accessToken, id);
      }
      if (!mounted) return;
      _clearSelection();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${ids.length} photo(s) déplacée(s) dans la corbeille.',
          ),
        ),
      );
      await _reload(silent: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Suppression impossible : $e')));
    }
  }

  Future<void> _unlockLocked() async {
    setState(() {
      _lockedError = null;
    });
    try {
      final auth = LocalAuthentication();
      final supported = await auth.isDeviceSupported();
      final canCheck = await auth.canCheckBiometrics;
      if (!supported && !canCheck) {
        setState(() {
          _lockedError =
              'Aucun verrouillage écran ou biométrie disponible sur ce téléphone.';
        });
        return;
      }
      final ok = await auth.authenticate(
        localizedReason:
            'Déverrouille Cloudity Photos Verrouillé avec l’empreinte, le visage ou le code du téléphone.',
        biometricOnly: false,
        persistAcrossBackgrounding: true,
      );
      if (!mounted) return;
      setState(() {
        _lockedUnlocked = ok;
        _lockedError = ok ? null : 'Déverrouillage annulé.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _lockedError = 'Déverrouillage impossible : $e');
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

  String _thumbUrl(int id) =>
      '${widget.session.api.baseUrl}/drive/nodes/$id/thumbnail?size=360';

  bool _isPhotoNode(Map<String, dynamic> node) {
    if (node['is_folder'] == true) return false;
    final name = (node['name'] as String? ?? '').toLowerCase();
    if (name.endsWith('.pdf')) return false;
    final mime = (node['mime_type'] as String? ?? '').toLowerCase();
    if (mime.contains('pdf')) return false;
    if (mime.startsWith('image/')) return true;
    return RegExp(
      r'\.(heic|heif|jpe?g|png|gif|webp|avif|bmp|tiff?|svg)$',
    ).hasMatch(name);
  }

  Future<void> _openPhoto(
    Map<String, dynamic> item, {
    bool fromTrash = false,
  }) async {
    final items = fromTrash ? _trashItems : _timelinePhotos;
    final initialIndex = items.indexWhere((e) => _itemId(e) == _itemId(item));
    if (initialIndex < 0) return;
    final returnedIndex = await Navigator.of(context).push<int>(
      MaterialPageRoute(
        builder: (_) => _PhotoViewerPage(
          items: items,
          initialIndex: initialIndex,
          baseUrl: widget.session.api.baseUrl,
          accessToken: widget.session.accessToken,
          fromTrash: fromTrash,
          onDelete: fromTrash ? null : _deletePhoto,
          onRestore: fromTrash ? _restorePhoto : null,
        ),
      ),
    );
    if (!fromTrash && returnedIndex != null && mounted) {
      final id = _itemId(items[returnedIndex]);
      _scrollToPhotoId(id);
    }
  }

  Widget _photoTile(
    List<Map<String, dynamic>> items,
    int index, {
    bool fromTrash = false,
  }) {
    final item = items[index];
    final id = _itemId(item);
    if (id == null) return const SizedBox.shrink();
    final name = (item['name'] as String?) ?? 'Photo';
    final selected = _selectedIds.contains(id);
    final tileKey = _photoKeys.putIfAbsent(id, GlobalKey.new);
    return Material(
      key: tileKey,
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          if (_selectionMode && !fromTrash) {
            _toggleSelected(item);
          } else {
            _openPhoto(item, fromTrash: fromTrash);
          }
        },
        onLongPress: fromTrash ? null : () => _toggleSelected(item),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _CloudityPhotoImage(
              url: _thumbUrl(id),
              headers: authHeaders(widget.session.accessToken, json: false),
              semanticLabel: name,
            ),
            if (_selectionMode && !fromTrash)
              Positioned(
                top: 6,
                left: 6,
                child: Icon(
                  selected ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: selected ? Colors.lightBlueAccent : Colors.white,
                  shadows: const [Shadow(blurRadius: 4, color: Colors.black54)],
                ),
              ),
            if (selected)
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.lightBlueAccent, width: 3),
                  color: Colors.lightBlueAccent.withValues(alpha: 0.18),
                ),
              ),
            Semantics(
              label: name,
              image: true,
              button: true,
              selected: selected,
              child: const SizedBox.expand(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeader({
    required String heading,
    required List<Map<String, dynamic>> items,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              heading,
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          IconButton(
            tooltip: _sectionAllSelected(items)
                ? 'Tout désélectionner'
                : 'Tout sélectionner',
            icon: Icon(
              _sectionAllSelected(items)
                  ? Icons.check_circle
                  : Icons.check_circle_outline,
            ),
            onPressed: () => _toggleSectionSelection(items),
          ),
        ],
      ),
    );
  }

  Widget _photosGrid(
    List<Map<String, dynamic>> items, {
    bool fromTrash = false,
    bool horizontal = false,
  }) {
    if (horizontal) {
      return SizedBox(
        height: 112,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: items.length,
          separatorBuilder: (context, index) => const SizedBox(width: 6),
          itemBuilder: (ctx, i) => SizedBox(
            width: 112,
            child: _photoTile(items, i, fromTrash: fromTrash),
          ),
        ),
      );
    }
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 6,
        mainAxisSpacing: 6,
        childAspectRatio: 1,
      ),
      itemCount: items.length,
      itemBuilder: (ctx, i) => _photoTile(items, i, fromTrash: fromTrash),
    );
  }

  Widget _buildTimelineBody() {
    final sections = _groupByDay(_items);
    return RefreshIndicator(
      onRefresh: _reload,
      child: _loading && _items.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 120),
                Center(child: CircularProgressIndicator()),
              ],
            )
          : _error != null && _items.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _reload,
                  child: const Text('Réessayer'),
                ),
              ],
            )
          : _items.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 80),
                Text(
                  'Aucune image. Activez la sauvegarde galerie ou téléversez depuis le web.',
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
              itemCount: sections.length + (_hasMore ? 1 : 0),
              itemBuilder: (context, index) {
                if (index < sections.length) {
                  final sec = sections[index];
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _sectionHeader(heading: sec.heading, items: sec.items),
                      _photosGrid(sec.items, horizontal: true),
                    ],
                  );
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Center(
                    child: FilledButton.tonal(
                      onPressed: _loadingMore ? null : _loadMore,
                      child: _loadingMore
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Charger plus'),
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildAlbumsBody() {
    final selected = _selectedAlbum;
    if (_albumsLoading && selected == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_albumsError != null && selected == null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            _albumsError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _loadAlbums, child: const Text('Réessayer')),
        ],
      );
    }
    if (selected != null) {
      return RefreshIndicator(
        onRefresh: () => _openAlbum(selected),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.arrow_back),
              title: Text((selected['name'] as String?) ?? 'Album'),
              subtitle: Text('${_albumItems.length} photo(s)'),
              onTap: _closeAlbum,
            ),
            if (_albumsLoading)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_albumItems.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 64),
                child: Text('Aucune photo dans cet album.'),
              )
            else
              _photosGrid(_albumItems),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadAlbums,
      child: _rootFolders.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 80),
                Text(
                  'Aucun album Drive pour l’instant. Le dossier Photos sera créé à la première sauvegarde.',
                ),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: _rootFolders.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final folder = _rootFolders[i];
                final name = (folder['name'] as String?) ?? 'Album';
                final childCount =
                    folder['file_count'] ?? folder['child_count'];
                return ListTile(
                  leading: const Icon(Icons.photo_album_outlined),
                  title: Text(name),
                  subtitle: childCount is int
                      ? Text('$childCount élément(s)')
                      : null,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openAlbum(folder),
                );
              },
            ),
    );
  }

  Widget _buildArchiveBody() {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: const [
        SizedBox(height: 80),
        Icon(Icons.archive_outlined, size: 48),
        SizedBox(height: 16),
        Text(
          'Archivé arrive ensuite.',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        SizedBox(height: 8),
        Text(
          'Le web affiche déjà cette section comme fonctionnalité à venir. '
          'Il faut un champ serveur dédié pour masquer une photo de la chronologie sans la supprimer.',
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildTrashBody() {
    if (_trashLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_trashError != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            _trashError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _loadTrash, child: const Text('Réessayer')),
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: _loadTrash,
      child: _trashItems.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 80),
                Icon(Icons.delete_outline, size: 48),
                SizedBox(height: 16),
                Text(
                  'Aucune photo dans la corbeille.',
                  textAlign: TextAlign.center,
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(4, 8, 4, 12),
                  child: Text(
                    'Photos supprimées côté Cloudity. Touchez une photo pour la restaurer.',
                  ),
                ),
                _photosGrid(_trashItems, fromTrash: true),
              ],
            ),
    );
  }

  Widget _buildLockedBody() {
    if (!_lockedUnlocked) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 72),
          const Icon(Icons.lock_outline, size: 56),
          const SizedBox(height: 16),
          const Text(
            'Verrouillé',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
          ),
          const SizedBox(height: 8),
          const Text(
            'Déverrouillage local par empreinte, visage ou code du téléphone. '
            'Le coffre serveur chiffré dédié reste à implémenter.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _unlockLocked,
            icon: const Icon(Icons.fingerprint),
            label: const Text('Déverrouiller'),
          ),
          if (_lockedError != null) ...[
            const SizedBox(height: 12),
            Text(
              _lockedError!,
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(24),
      children: const [
        SizedBox(height: 72),
        Icon(Icons.lock_open_outlined, size: 56),
        SizedBox(height: 16),
        Text(
          'Coffre déverrouillé',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
        ),
        SizedBox(height: 8),
        Text(
          'Aucune photo verrouillée pour l’instant. '
          'Prochaine étape : déplacer des photos dans un album verrouillé serveur, chiffré et masqué de la timeline.',
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildSettingsBody() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        ListTile(
          leading: Icon(_backupIcon),
          title: Text(
            _backupEnabled
                ? 'Synchronisation active'
                : 'Synchronisation arrêtée',
          ),
          subtitle: Text(_backupStatusSummary),
          trailing: const Icon(Icons.chevron_right),
          onTap: _openBackupSettings,
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.link_outlined),
          title: const Text('Gateway Cloudity'),
          subtitle: Text(widget.session.api.baseUrl),
        ),
        ListTile(
          leading: const Icon(Icons.refresh),
          title: const Text('Rafraîchir la chronologie'),
          onTap: () {
            _setTab(_PhotosTab.timeline);
            _reload();
          },
        ),
        const Divider(),
        ListTile(
          leading: Icon(
            Icons.logout,
            color: Theme.of(context).colorScheme.error,
          ),
          title: Text(
            'Déconnecter ce téléphone',
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          subtitle: const Text('Efface la session locale Photos'),
          onTap: _confirmLogout,
        ),
      ],
    );
  }

  Widget _buildDrawer() {
    Widget destination({
      required IconData icon,
      required String label,
      required _PhotosTab tab,
    }) {
      final selected = _tab == tab;
      return ListTile(
        leading: Icon(icon),
        title: Text(label),
        selected: selected,
        onTap: () {
          Navigator.pop(context);
          _setTab(tab);
        },
      );
    }

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
            destination(
              icon: Icons.photo_library_outlined,
              label: 'Photos',
              tab: _PhotosTab.timeline,
            ),
            destination(
              icon: Icons.photo_album_outlined,
              label: 'Albums',
              tab: _PhotosTab.albums,
            ),
            destination(
              icon: Icons.archive_outlined,
              label: 'Archivé',
              tab: _PhotosTab.archive,
            ),
            destination(
              icon: Icons.delete_outline,
              label: 'Corbeille',
              tab: _PhotosTab.trash,
            ),
            destination(
              icon: Icons.lock_outline,
              label: 'Verrouillé',
              tab: _PhotosTab.locked,
            ),
            const Divider(),
            ListTile(
              leading: Icon(_backupIcon),
              title: Text(
                _backupEnabled && _backupPendingWork
                    ? 'Sauvegarde en arrière-plan'
                    : _backupEnabled
                    ? 'Synchronisation active'
                    : 'Synchronisation arrêtée',
              ),
              subtitle: Text(
                _backupEnabled ? _backupStatusSummary : 'Ouvrir les réglages',
              ),
              onTap: () {
                Navigator.pop(context);
                _openBackupSettings();
              },
            ),
            destination(
              icon: Icons.settings_outlined,
              label: 'Paramètres',
              tab: _PhotosTab.settings,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = switch (_tab) {
      _PhotosTab.timeline => 'Photos',
      _PhotosTab.albums =>
        _selectedAlbum == null
            ? 'Albums'
            : (_selectedAlbum!['name'] as String? ?? 'Album'),
      _PhotosTab.archive => 'Archivé',
      _PhotosTab.trash => 'Corbeille',
      _PhotosTab.locked => 'Verrouillé',
      _PhotosTab.settings => 'Paramètres',
    };
    final body = switch (_tab) {
      _PhotosTab.timeline => _buildTimelineBody(),
      _PhotosTab.albums => _buildAlbumsBody(),
      _PhotosTab.archive => _buildArchiveBody(),
      _PhotosTab.trash => _buildTrashBody(),
      _PhotosTab.locked => _buildLockedBody(),
      _PhotosTab.settings => _buildSettingsBody(),
    };
    return Scaffold(
      key: const ValueKey('cloudity_photos_timeline'),
      drawer: _selectionMode ? null : _buildDrawer(),
      appBar: AppBar(
        leading: _selectionMode
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: _clearSelection,
              )
            : null,
        title: Text(
          _selectionMode ? '${_selectedIds.length} sélectionnée(s)' : title,
        ),
        actions: [
          if (_selectionMode)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Mettre à la corbeille',
              onPressed: _deleteSelected,
            )
          else ...[
            IconButton(
              icon: _BackupAppBarIcon(
                icon: _backupIcon,
                animated: _backupEnabled && _backupPendingWork,
              ),
              tooltip: _backupTooltip,
              onPressed: _openBackupSettings,
            ),
            if (_tab == _PhotosTab.timeline)
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Rafraîchir',
                onPressed: _loading ? null : () => _reload(silent: true),
              ),
            if (_tab == _PhotosTab.albums)
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Rafraîchir les albums',
                onPressed: _albumsLoading ? null : _loadAlbums,
              ),
            if (_tab == _PhotosTab.trash)
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Rafraîchir la corbeille',
                onPressed: _trashLoading ? null : _loadTrash,
              ),
          ],
        ],
      ),
      body: body,
    );
  }
}

class _CloudityPhotoImage extends StatefulWidget {
  const _CloudityPhotoImage({
    required this.url,
    required this.headers,
    required this.semanticLabel,
    this.fit = BoxFit.cover,
  });

  final String url;
  final Map<String, String> headers;
  final String semanticLabel;
  final BoxFit fit;

  @override
  State<_CloudityPhotoImage> createState() => _CloudityPhotoImageState();
}

class _CloudityPhotoImageState extends State<_CloudityPhotoImage> {
  Uint8List? _bytes;
  bool _loading = true;
  bool _failed = false;
  int _retry = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _CloudityPhotoImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
      _bytes = null;
    });
    try {
      final bytes = await PhotoLoadQueue.instance.run(() async {
        final res = await http
            .get(Uri.parse(widget.url), headers: widget.headers)
            .timeout(const Duration(seconds: 45));
        if (res.statusCode == 429) {
          await Future<void>.delayed(
            Duration(milliseconds: 400 * (_retry + 1)),
          );
          throw const _PhotoLoadRetryable('rate_limited');
        }
        if (res.statusCode != 200) {
          throw StateError('HTTP ${res.statusCode}');
        }
        return res.bodyBytes;
      });
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _loading = false;
      });
    } on _PhotoLoadRetryable {
      if (!mounted) return;
      setState(() {
        _retry++;
        _loading = false;
        _failed = true;
      });
      if (_retry < 4) {
        await Future<void>.delayed(Duration(milliseconds: 500 * _retry));
        if (mounted) _load();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const ColoredBox(
        color: Color(0xFFE5E7EB),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    if (_bytes != null && !_failed) {
      return Image.memory(
        _bytes!,
        fit: widget.fit,
        semanticLabel: widget.semanticLabel,
        gaplessPlayback: true,
      );
    }
    return ColoredBox(
      color: Colors.grey.shade300,
      child: Center(
        child: IconButton(
          tooltip: 'Réessayer le chargement',
          icon: Icon(Icons.refresh, color: Colors.grey.shade700),
          onPressed: () {
            _retry = 0;
            _load();
          },
        ),
      ),
    );
  }
}

class _PhotoLoadRetryable implements Exception {
  const _PhotoLoadRetryable(this.code);
  final String code;
}

class _BackupAppBarIcon extends StatelessWidget {
  const _BackupAppBarIcon({required this.icon, required this.animated});

  final IconData icon;
  final bool animated;

  @override
  Widget build(BuildContext context) {
    if (!animated) return Icon(icon);
    final color = Theme.of(context).colorScheme.primary;
    return Stack(
      alignment: Alignment.center,
      children: [
        SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(strokeWidth: 2, color: color),
        ),
        Icon(icon, size: 19),
      ],
    );
  }
}

class _PhotoViewerPage extends StatefulWidget {
  const _PhotoViewerPage({
    required this.items,
    required this.initialIndex,
    required this.baseUrl,
    required this.accessToken,
    required this.fromTrash,
    this.onDelete,
    this.onRestore,
  });

  final List<Map<String, dynamic>> items;
  final int initialIndex;
  final String baseUrl;
  final String accessToken;
  final bool fromTrash;
  final Future<void> Function(Map<String, dynamic> item)? onDelete;
  final Future<void> Function(Map<String, dynamic> item)? onRestore;

  @override
  State<_PhotoViewerPage> createState() => _PhotoViewerPageState();
}

class _PhotoViewerPageState extends State<_PhotoViewerPage> {
  late final PageController _pageController;
  late int _index;
  double _dragOffset = 0;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _closeViewer() {
    Navigator.of(context).pop(_index);
  }

  Map<String, dynamic> get _current => widget.items[_index];

  String _imageUrl(Map<String, dynamic> item) {
    final id = (item['id'] as num).toInt();
    final base = widget.baseUrl.trim().replaceAll(RegExp(r'/$'), '');
    return '$base/drive/nodes/$id/content?inline=1';
  }

  String _dateHeading(Map<String, dynamic> item) {
    final raw = (item['taken_at'] ?? item['created_at'] ?? item['updated_at'])
        ?.toString();
    final d = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    if (d == null) return 'Date inconnue';
    return '${d.day} ${_monthsFr[d.month - 1]} ${d.year}';
  }

  String _dateLabel(Map<String, dynamic> item) {
    final raw = (item['taken_at'] ?? item['created_at'] ?? item['updated_at'])
        ?.toString();
    final d = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    if (d == null) return 'Date inconnue';
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} · $h:$m';
  }

  String _sizeLabel(Map<String, dynamic> item) {
    final size = item['size'];
    if (size is! num || size <= 0) return 'Taille inconnue';
    final mb = size / (1024 * 1024);
    if (mb >= 1) return '${mb.toStringAsFixed(1)} Mo';
    return '${(size / 1024).toStringAsFixed(0)} Ko';
  }

  void _showInfo() {
    final item = _current;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.paddingOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _dateHeading(item),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.calendar_today_outlined),
              title: const Text('Date'),
              subtitle: Text(_dateLabel(item)),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.storage_outlined),
              title: const Text('Taille'),
              subtitle: Text(_sizeLabel(item)),
            ),
            const Text(
              'Mettre une photo à la corbeille agit côté Cloudity. '
              'Arrêter la synchronisation se fait depuis Paramètres > Sauvegarde galerie et n’efface jamais les photos locales du téléphone.',
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = _dateHeading(_current);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_downward),
          tooltip: 'Revenir à la galerie',
          onPressed: _closeViewer,
        ),
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (widget.onRestore != null)
            IconButton(
              tooltip: 'Restaurer',
              icon: const Icon(Icons.restore_outlined),
              onPressed: () async {
                await widget.onRestore!(_current);
                if (!context.mounted) return;
                Navigator.of(context).pop(_index);
              },
            ),
          if (widget.onDelete != null)
            IconButton(
              tooltip: 'Mettre à la corbeille',
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                await widget.onDelete!(_current);
                if (!context.mounted) return;
                Navigator.of(context).pop(_index);
              },
            ),
          IconButton(
            tooltip: 'Informations',
            icon: const Icon(Icons.info_outline),
            onPressed: _showInfo,
          ),
        ],
      ),
      body: GestureDetector(
        onVerticalDragUpdate: (details) {
          if (details.delta.dy > 0) {
            setState(() => _dragOffset += details.delta.dy);
          }
        },
        onVerticalDragEnd: (details) {
          if (_dragOffset > 72 || details.velocity.pixelsPerSecond.dy > 700) {
            _closeViewer();
            return;
          }
          setState(() => _dragOffset = 0);
        },
        child: Transform.translate(
          offset: Offset(0, _dragOffset),
          child: PageView.builder(
            controller: _pageController,
            itemCount: widget.items.length,
            onPageChanged: (index) => setState(() => _index = index),
            itemBuilder: (context, index) {
              final item = widget.items[index];
              return GestureDetector(
                onVerticalDragEnd: (details) {
                  if (details.velocity.pixelsPerSecond.dy < -500) {
                    _showInfo();
                  }
                },
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
                  child: Center(
                    child: _CloudityPhotoImage(
                      url: _imageUrl(item),
                      headers: authHeaders(widget.accessToken, json: false),
                      semanticLabel: _dateHeading(item),
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Text(
            _dateLabel(_current),
            style: const TextStyle(color: Colors.white70),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
