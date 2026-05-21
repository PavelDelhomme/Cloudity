import 'package:shared_preferences/shared_preferences.dart';

/// Préférences locales pour la sauvegarde galerie → Cloudity (Android WorkManager).
class GallerySyncPrefs {
  static const _enabled = 'cloudity_photos_gallery_backup_enabled';
  static const _wifiOnly = 'cloudity_photos_gallery_wifi_only';
  static const _requireCharging = 'cloudity_photos_gallery_require_charging';
  static const _selectedAlbumIds =
      'cloudity_photos_gallery_selected_album_ids_v1';
  static const _lastRunAt = 'cloudity_photos_gallery_last_run_at_v1';
  static const _lastUploaded = 'cloudity_photos_gallery_last_uploaded_v1';
  static const _lastSkipped = 'cloudity_photos_gallery_last_skipped_v1';
  static const _lastError = 'cloudity_photos_gallery_last_error_v1';
  static const _uploadedPrefix = 'cloudity_photos_uploaded_asset:';

  static Future<bool> isBackupEnabled() async {
    final p = await SharedPreferences.getInstance();
    return p.getBool(_enabled) ?? false;
  }

  static Future<void> setBackupEnabled(bool value) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_enabled, value);
  }

  static Future<bool> wifiOnly() async {
    final p = await SharedPreferences.getInstance();
    return p.getBool(_wifiOnly) ?? true;
  }

  static Future<void> setWifiOnly(bool value) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_wifiOnly, value);
  }

  static Future<bool> requireCharging() async {
    final p = await SharedPreferences.getInstance();
    return p.getBool(_requireCharging) ?? false;
  }

  static Future<void> setRequireCharging(bool value) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_requireCharging, value);
  }

  /// IDs `photo_manager` des albums Android inclus dans la sauvegarde.
  /// Liste vide = toutes les photos via l’album global du téléphone.
  static Future<Set<String>> selectedAlbumIds() async {
    final p = await SharedPreferences.getInstance();
    return (p.getStringList(_selectedAlbumIds) ?? const <String>[]).toSet();
  }

  static Future<void> setSelectedAlbumIds(Iterable<String> ids) async {
    final p = await SharedPreferences.getInstance();
    final cleaned =
        ids.map((id) => id.trim()).where((id) => id.isNotEmpty).toSet().toList()
          ..sort();
    await p.setStringList(_selectedAlbumIds, cleaned);
  }

  static Future<GallerySyncLastRun?> lastRun() async {
    final p = await SharedPreferences.getInstance();
    final at = p.getString(_lastRunAt);
    if (at == null || at.isEmpty) return null;
    return GallerySyncLastRun(
      at: DateTime.tryParse(at),
      uploaded: p.getInt(_lastUploaded) ?? 0,
      skipped: p.getInt(_lastSkipped) ?? 0,
      error: p.getString(_lastError),
    );
  }

  static Future<void> saveLastRun({
    required int uploaded,
    required int skipped,
    String? error,
  }) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_lastRunAt, DateTime.now().toUtc().toIso8601String());
    await p.setInt(_lastUploaded, uploaded);
    await p.setInt(_lastSkipped, skipped);
    if (error == null || error.isEmpty) {
      await p.remove(_lastError);
    } else {
      await p.setString(_lastError, error);
    }
  }

  static Future<bool> isAssetUploaded(String assetId) async {
    final p = await SharedPreferences.getInstance();
    return p.getBool('$_uploadedPrefix$assetId') ?? false;
  }

  static Future<void> markAssetUploaded(String assetId) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('$_uploadedPrefix$assetId', true);
  }
}

class GallerySyncLastRun {
  const GallerySyncLastRun({
    required this.at,
    required this.uploaded,
    required this.skipped,
    required this.error,
  });

  final DateTime? at;
  final int uploaded;
  final int skipped;
  final String? error;

  bool get failed => error != null && error!.isNotEmpty;
}
