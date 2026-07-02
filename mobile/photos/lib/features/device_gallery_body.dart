import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';

import 'package:cloudity_shared/photo_match.dart';
import 'gallery_permissions.dart';
import 'gallery_sync_prefs.dart';
import 'photo_sync_badge.dart';

/// Galerie locale du téléphone avec badges de statut cloud.
class DeviceGalleryBody extends StatefulWidget {
  const DeviceGalleryBody({
    super.key,
    required this.backupEnabled,
    this.gatewayBase,
    this.accessToken,
  });

  final bool backupEnabled;
  final String? gatewayBase;
  final String? accessToken;

  @override
  State<DeviceGalleryBody> createState() => _DeviceGalleryBodyState();
}

class _DeviceGalleryBodyState extends State<DeviceGalleryBody> {
  bool _loading = true;
  String? _error;
  final List<_LocalPhoto> _photos = [];
  PhotoCloudIndex? _cloudIndex;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant DeviceGalleryBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.backupEnabled != widget.backupEnabled) {
      _refreshStatuses();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final perm = await requestGalleryPermission();
      if (!hasGalleryAccess(perm)) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = galleryPermissionMessage(perm);
        });
        return;
      }
      final paths = await PhotoManager.getAssetPathList(
        type: RequestType.image,
        hasAll: true,
      );
      if (paths.isEmpty) {
        if (!mounted) return;
        setState(() {
          _photos.clear();
          _loading = false;
        });
        return;
      }
      final all = paths.firstWhere(
        (p) => p.isAll,
        orElse: () => paths.first,
      );
      final assets = await all.getAssetListPaged(page: 0, size: 120);
      PhotoCloudIndex? cloudIndex;
      final gateway = widget.gatewayBase?.trim();
      final token = widget.accessToken?.trim();
      if (gateway != null &&
          gateway.isNotEmpty &&
          token != null &&
          token.isNotEmpty) {
        try {
          final fps = await PhotoMatchClient(
            gateway,
          ).fetchFingerprints(token);
          cloudIndex = PhotoCloudIndex.fromFingerprints(fps);
        } catch (_) {
          cloudIndex = null;
        }
      }
      final items = <_LocalPhoto>[];
      for (final asset in assets) {
        final fileName = asset.title?.trim().isNotEmpty == true
            ? asset.title!.trim()
            : 'photo_${asset.id}.jpg';
        final normalizedName = fileName.contains('.') ? fileName : '$fileName.jpg';
        final file = await asset.file;
        final fileSize = file != null ? await file.length() : 0;
        final localBackedUp = await GallerySyncPrefs.isAssetUploaded(asset.id);
        final cloudHit = cloudIndex?.matchLocal(
          name: normalizedName,
          size: fileSize,
        );
        final status = cloudHit != null || localBackedUp
            ? PhotoSyncStatus.backedUp
            : widget.backupEnabled
            ? PhotoSyncStatus.pendingUpload
            : PhotoSyncStatus.localOnly;
        items.add(_LocalPhoto(asset: asset, status: status));
      }
      if (!mounted) return;
      setState(() {
        _cloudIndex = cloudIndex;
        _photos
          ..clear()
          ..addAll(items);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _refreshStatuses() async {
    if (_photos.isEmpty) return;
    final updated = <_LocalPhoto>[];
    for (final photo in _photos) {
      final fileName = photo.asset.title?.trim().isNotEmpty == true
          ? photo.asset.title!.trim()
          : 'photo_${photo.asset.id}.jpg';
      final normalizedName = fileName.contains('.') ? fileName : '$fileName.jpg';
      final file = await photo.asset.file;
      final fileSize = file != null ? await file.length() : 0;
      final localBackedUp = await GallerySyncPrefs.isAssetUploaded(photo.asset.id);
      final cloudHit = _cloudIndex?.matchLocal(
        name: normalizedName,
        size: fileSize,
      );
      updated.add(
        _LocalPhoto(
          asset: photo.asset,
          status: cloudHit != null || localBackedUp
              ? PhotoSyncStatus.backedUp
              : widget.backupEnabled
              ? PhotoSyncStatus.pendingUpload
              : PhotoSyncStatus.localOnly,
        ),
      );
    }
    if (!mounted) return;
    setState(() {
      _photos
        ..clear()
        ..addAll(updated);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
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
          FilledButton(onPressed: _load, child: const Text('Réessayer')),
        ],
      );
    }
    if (_photos.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          SizedBox(height: 80),
          Text('Aucune photo locale trouvée sur cet appareil.'),
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 8, 4, 12),
            child: Text(
              'Photos sur cet appareil. Les badges indiquent si elles sont déjà '
              'sauvegardées sur Cloudity.',
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 6,
              mainAxisSpacing: 6,
              childAspectRatio: 1,
            ),
            itemCount: _photos.length,
            itemBuilder: (context, index) {
              final photo = _photos[index];
              return _LocalPhotoTile(photo: photo);
            },
          ),
        ],
      ),
    );
  }
}

class _LocalPhoto {
  const _LocalPhoto({required this.asset, required this.status});

  final AssetEntity asset;
  final PhotoSyncStatus status;
}

class _LocalPhotoTile extends StatelessWidget {
  const _LocalPhotoTile({required this.photo});

  final _LocalPhoto photo;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          FutureBuilder<Uint8List?>(
            future: photo.asset.thumbnailDataWithSize(
              const ThumbnailSize(360, 360),
            ),
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return ColoredBox(
                  color: Colors.grey.shade300,
                  child: const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              }
              final bytes = snapshot.data;
              if (bytes == null) {
                return ColoredBox(
                  color: Colors.grey.shade300,
                  child: const Icon(Icons.broken_image_outlined),
                );
              }
              return Image.memory(bytes, fit: BoxFit.cover);
            },
          ),
          Positioned(
            left: 4,
            right: 4,
            bottom: 4,
            child: PhotoSyncBadge(status: photo.status),
          ),
        ],
      ),
    );
  }
}
