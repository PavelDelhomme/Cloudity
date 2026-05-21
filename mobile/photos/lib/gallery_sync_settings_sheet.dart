import 'dart:io';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';

import 'gallery_backup.dart';
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
  Set<String> _selectedAlbumIds = {};
  String? _lastMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final enabled = await GallerySyncPrefs.isBackupEnabled();
    final wifi = await GallerySyncPrefs.wifiOnly();
    final charging = await GallerySyncPrefs.requireCharging();
    final selectedAlbumIds = await GallerySyncPrefs.selectedAlbumIds();
    if (!mounted) return;
    setState(() {
      _enabled = enabled;
      _wifiOnly = wifi;
      _requireCharging = charging;
      _selectedAlbumIds = selectedAlbumIds;
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
        setState(
          () => _lastMessage =
              'Première sauvegarde planifiée (Wi‑Fi / charge selon options).',
        );
      }
    }
  }

  Future<void> _runNow() async {
    setState(() {
      _running = true;
      _lastMessage = null;
    });
    final result = await runGalleryBackupJob();
    if (!mounted) return;
    setState(() {
      _running = false;
      if (result.skipped) {
        _lastMessage = result.reason ?? 'Passage ignoré.';
      } else {
        _lastMessage =
            '${result.uploaded} photo(s) envoyée(s) · ${result.skippedCount} déjà à jour ou ignorée(s).';
      }
    });
  }

  String get _albumSummary {
    if (_selectedAlbumIds.isEmpty) return 'Toutes les photos';
    if (_selectedAlbumIds.length == 1) return '1 dossier sélectionné';
    return '${_selectedAlbumIds.length} dossiers sélectionnés';
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
    if (!mounted) return;

    var draft = Set<String>.of(_selectedAlbumIds);
    final selected = await showDialog<Set<String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Dossiers à sauvegarder'),
          content: SizedBox(
            width: double.maxFinite,
            child: albums.isEmpty
                ? const Text('Aucun dossier photo trouvé sur ce téléphone.')
                : ListView(
                    shrinkWrap: true,
                    children: [
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Toutes les photos'),
                        subtitle: const Text(
                          'Recommandé pour une sauvegarde complète',
                        ),
                        value: draft.isEmpty,
                        onChanged: (_) =>
                            setDialogState(() => draft = <String>{}),
                      ),
                      const Divider(),
                      for (final album in albums)
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(album.name),
                          value: draft.contains(album.id),
                          onChanged: (value) => setDialogState(() {
                            if (value == true) {
                              draft.add(album.id);
                            } else {
                              draft.remove(album.id);
                            }
                          }),
                        ),
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
            'Jobs espacés (≥ 15 min), petits lots, sans scan continu.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Activer la sauvegarde'),
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
            enabled: _enabled,
            onTap: _enabled ? _selectAlbums : null,
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
          if (_lastMessage != null) ...[
            const SizedBox(height: 12),
            Text(_lastMessage!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}
