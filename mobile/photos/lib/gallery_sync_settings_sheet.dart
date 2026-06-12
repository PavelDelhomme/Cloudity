import 'dart:io';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';

import 'gallery_backup.dart';
import 'gallery_album_catalog.dart';
import 'gallery_permissions.dart';
import 'gallery_sync_prefs.dart';
import 'gallery_sync_scheduler.dart';

/// Feuille de réglages sauvegarde galerie (Android).
class GallerySyncSettingsSheet extends StatefulWidget {
  const GallerySyncSettingsSheet({super.key});

  @override
  State<GallerySyncSettingsSheet> createState() =>
      _GallerySyncSettingsSheetState();
}

class _GallerySyncSettingsSheetState extends State<GallerySyncSettingsSheet> {
  bool _loading = true;
  bool _enabled = false;
  bool _wifiOnly = true;
  bool _requireCharging = false;
  bool _running = false;
  bool _pendingWork = false;
  Set<String> _selectedAlbumIds = {};
  GallerySyncLastRun? _lastRun;
  String? _lastMessage;
  Timer? _statusTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _statusTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _statusTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final enabled = await GallerySyncPrefs.isBackupEnabled();
    final wifi = await GallerySyncPrefs.wifiOnly();
    final charging = await GallerySyncPrefs.requireCharging();
    final selectedAlbumIds = await GallerySyncPrefs.selectedAlbumIds();
    final lastRun = await GallerySyncPrefs.lastRun();
    final pendingWork = await GallerySyncPrefs.hasPendingWork();
    if (!mounted) return;
    setState(() {
      _enabled = enabled;
      _wifiOnly = wifi;
      _requireCharging = charging;
      _selectedAlbumIds = selectedAlbumIds;
      _lastRun = lastRun;
      _pendingWork = pendingWork;
      _loading = false;
    });
  }

  Future<void> _setEnabled(bool value) async {
    if (value) {
      final perm = await requestGalleryPermission();
      if (!hasGalleryAccess(perm)) {
        await GallerySyncPrefs.setBackupEnabled(false);
        await applyGallerySyncSchedule();
        if (!mounted) return;
        setState(() {
          _enabled = false;
          _lastMessage = galleryPermissionMessage(perm);
        });
        return;
      }
      if (!mounted) return;
      setState(() => _lastMessage = galleryPermissionMessage(perm));
    }

    setState(() => _enabled = value);
    await GallerySyncPrefs.setBackupEnabled(value);
    await applyGallerySyncSchedule();
    if (value) {
      await enqueueGalleryBackupNow();
      if (mounted) {
        setState(() {
          _pendingWork = true;
          _lastMessage =
              'Première sauvegarde planifiée (Wi‑Fi / charge selon options).';
        });
      }
    } else if (mounted) {
      await GallerySyncPrefs.clearScanCursor();
      setState(() {
        _pendingWork = false;
        _lastMessage =
            'Synchronisation arrêtée. Les photos restent sur le téléphone et rien n’est supprimé.';
      });
    }
  }

  Future<void> _stopBackup() async {
    if (!_enabled) return;
    await _setEnabled(false);
  }

  Future<void> _runNow() async {
    setState(() {
      _running = true;
      _pendingWork = true;
      _lastMessage = null;
    });
    final result = await runGalleryBackupJob();
    if (result.hasMore) {
      await enqueueGalleryBackupNow();
    }
    final lastRun = await GallerySyncPrefs.lastRun();
    if (!mounted) return;
    setState(() {
      _running = false;
      _lastRun = lastRun;
      _pendingWork = result.hasMore;
      if (result.skipped) {
        _lastMessage = result.reason ?? 'Passage ignoré.';
      } else {
        final suffix = result.hasMore
            ? ' Suite planifiée en arrière-plan.'
            : '';
        _lastMessage =
            '${result.uploaded} photo(s) envoyée(s) · ${result.skippedCount} déjà à jour ou ignorée(s).$suffix';
      }
    });
  }

  String get _albumSummary {
    if (_selectedAlbumIds.isEmpty) {
      return 'Toutes les photos, dont Appareil photo';
    }
    if (_selectedAlbumIds.length == 1) return '1 dossier sélectionné';
    return '${_selectedAlbumIds.length} dossiers sélectionnés';
  }

  String get _lastRunSummary {
    final run = _lastRun;
    if (run == null) {
      return 'Aucune sauvegarde lancée depuis cette installation.';
    }
    final at = run.at?.toLocal();
    final when = at == null
        ? 'date inconnue'
        : '${at.day.toString().padLeft(2, '0')}/${at.month.toString().padLeft(2, '0')} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
    if (run.failed) return 'Dernier passage $when : ${run.error}';
    return 'Dernier passage $when : ${run.uploaded} envoyée(s), ${run.skipped} déjà à jour/ignorée(s).';
  }

  String get _liveStatusTitle {
    if (!_enabled) return 'Sauvegarde désactivée';
    if (_running) return 'Sauvegarde en cours…';
    if (_pendingWork) return 'Suite planifiée en arrière-plan';
    if (_lastRun?.failed == true) return 'Dernier passage en erreur';
    return 'Sauvegarde prête';
  }

  String get _liveStatusSubtitle {
    if (!_enabled) {
      return 'Active-la pour envoyer automatiquement les nouvelles photos.';
    }
    if (_running) {
      return 'Cloudity analyse les dossiers sélectionnés et envoie un lot de photos.';
    }
    if (_pendingWork) {
      return 'Le prochain lot continuera même si ce panneau est fermé.';
    }
    if (_lastRun?.failed == true) return _lastRun!.error ?? 'Erreur inconnue';
    return 'Les prochains passages seront lancés par Android WorkManager.';
  }

  Future<void> _selectAlbums() async {
    final perm = await requestGalleryPermission();
    if (!hasGalleryAccess(perm)) {
      if (mounted) {
        setState(() => _lastMessage = galleryPermissionMessage(perm));
      }
      return;
    }
    final albums = await PhotoManager.getAssetPathList(
      type: RequestType.image,
      hasAll: false,
    );
    final sortedAlbums = [...albums]
      ..sort((a, b) {
        final pa = describeGalleryAlbum(a.name);
        final pb = describeGalleryAlbum(b.name);
        if (pa.suggested != pb.suggested) return pa.suggested ? -1 : 1;
        return pa.label.compareTo(pb.label);
      });
    if (!mounted) return;

    var draft = Set<String>.of(_selectedAlbumIds);
    final selected = await showDialog<Set<String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Dossiers à sauvegarder'),
          content: SizedBox(
            width: double.maxFinite,
            child: sortedAlbums.isEmpty
                ? const Text('Aucun dossier photo trouvé sur ce téléphone.')
                : ListView(
                    shrinkWrap: true,
                    children: [
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Toutes les photos'),
                        subtitle: const Text(
                          'Par défaut : inclut Appareil photo / Camera et les dossiers de base',
                        ),
                        value: draft.isEmpty,
                        onChanged: (_) =>
                            setDialogState(() => draft = <String>{}),
                      ),
                      const Divider(),
                      for (final album in sortedAlbums) ...[
                        Builder(
                          builder: (context) {
                            final presentation = describeGalleryAlbum(
                              album.name,
                            );
                            return CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(presentation.label),
                              subtitle: Text(
                                presentation.suggested
                                    ? '${album.name} · recommandé'
                                    : album.name,
                              ),
                              value: draft.contains(album.id),
                              onChanged: (value) => setDialogState(() {
                                if (value == true) {
                                  draft.add(album.id);
                                } else {
                                  draft.remove(album.id);
                                }
                              }),
                            );
                          },
                        ),
                      ],
                    ],
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, draft),
              child: const Text('Enregistrer'),
            ),
          ],
        ),
      ),
    );
    if (selected == null || !mounted) return;

    await GallerySyncPrefs.setSelectedAlbumIds(selected);
    setState(() {
      _selectedAlbumIds = selected;
      _lastMessage = selected.isEmpty
          ? 'Sauvegarde configurée sur toutes les photos.'
          : 'Sauvegarde configurée sur ${selected.length} dossier(s).';
    });
  }

  Future<void> _openAndroidSettings() async {
    await PhotoManager.openSetting();
  }

  @override
  Widget build(BuildContext context) {
    if (!Platform.isAndroid) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'La sauvegarde galerie en arrière-plan est disponible sur Android pour l’instant.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      );
    }

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 16 + MediaQuery.paddingOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Sauvegarde galerie',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Envoie de nouvelles photos vers le dossier Drive « Photos ». '
              'Si aucun dossier précis n’est choisi, Cloudity sauvegarde toutes les photos, dont Appareil photo / Camera.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            _GalleryBackupLiveStatusCard(
              active: _enabled,
              animated: _running || _pendingWork,
              error: _lastRun?.failed == true,
              title: _liveStatusTitle,
              subtitle: _liveStatusSubtitle,
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Activer la sauvegarde'),
              subtitle: const Text(
                'Désactiver arrête la synchronisation, sans supprimer les photos locales.',
              ),
              value: _enabled,
              onChanged: _setEnabled,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Wi‑Fi uniquement'),
              subtitle: const Text('Pas d’upload sur données mobiles'),
              value: _wifiOnly,
              onChanged: _enabled
                  ? (v) async {
                      setState(() => _wifiOnly = v);
                      await GallerySyncPrefs.setWifiOnly(v);
                      await applyGallerySyncSchedule();
                    }
                  : null,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Uniquement en charge'),
              value: _requireCharging,
              onChanged: _enabled
                  ? (v) async {
                      setState(() => _requireCharging = v);
                      await GallerySyncPrefs.setRequireCharging(v);
                      await applyGallerySyncSchedule();
                    }
                  : null,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.folder_copy_outlined),
              title: const Text('Dossiers à sauvegarder'),
              subtitle: Text(_albumSummary),
              trailing: const Icon(Icons.chevron_right),
              onTap: _selectAlbums,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                _lastRun?.failed == true
                    ? Icons.error_outline
                    : Icons.verified_outlined,
              ),
              title: const Text('État de la sauvegarde'),
              subtitle: Text(_lastRunSummary),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: !_enabled || _running ? null : _runNow,
              icon: _running
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.cloud_upload_outlined, size: 20),
              label: Text(_running ? 'Sauvegarde…' : 'Sauvegarder maintenant'),
            ),
            TextButton.icon(
              onPressed: _openAndroidSettings,
              icon: const Icon(Icons.settings_outlined, size: 18),
              label: const Text('Ouvrir les permissions Android'),
            ),
            if (_enabled)
              OutlinedButton.icon(
                onPressed: _stopBackup,
                icon: const Icon(Icons.cloud_off_outlined, size: 18),
                label: const Text('Arrêter la synchronisation'),
              ),
            if (_lastMessage != null) ...[
              const SizedBox(height: 12),
              Text(_lastMessage!, style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}

class _GalleryBackupLiveStatusCard extends StatelessWidget {
  const _GalleryBackupLiveStatusCard({
    required this.active,
    required this.animated,
    required this.error,
    required this.title,
    required this.subtitle,
  });

  final bool active;
  final bool animated;
  final bool error;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final color = error
        ? colorScheme.error
        : active
        ? colorScheme.primary
        : colorScheme.outline;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: active ? 0.10 : 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PulsingCloudIcon(color: color, animated: animated),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Text(
                    title,
                    key: ValueKey(title),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                if (animated) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      minHeight: 5,
                      backgroundColor: color.withValues(alpha: 0.14),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingCloudIcon extends StatelessWidget {
  const _PulsingCloudIcon({required this.color, required this.animated});

  final Color color;
  final bool animated;

  @override
  Widget build(BuildContext context) {
    if (!animated) {
      return Icon(Icons.cloud_done_outlined, color: color, size: 30);
    }
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.86, end: 1.08),
      duration: const Duration(milliseconds: 850),
      curve: Curves.easeInOut,
      builder: (context, scale, child) {
        return Transform.scale(scale: scale, child: child);
      },
      onEnd: () {},
      child: Icon(Icons.cloud_sync_outlined, color: color, size: 30),
    );
  }
}
