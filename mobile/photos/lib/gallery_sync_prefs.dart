import 'package:shared_preferences/shared_preferences.dart';

/// Préférences locales pour la sauvegarde galerie → Cloudity (Android WorkManager).
class GallerySyncPrefs {
  static const _enabled = 'cloudity_photos_gallery_backup_enabled';
  static const _wifiOnly = 'cloudity_photos_gallery_wifi_only';
  static const _requireCharging = 'cloudity_photos_gallery_require_charging';
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

  static Future<bool> isAssetUploaded(String assetId) async {
    final p = await SharedPreferences.getInstance();
    return p.getBool('$_uploadedPrefix$assetId') ?? false;
  }

  static Future<void> markAssetUploaded(String assetId) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('$_uploadedPrefix$assetId', true);
  }
}
