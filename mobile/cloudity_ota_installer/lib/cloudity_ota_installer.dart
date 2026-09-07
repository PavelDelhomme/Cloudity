import 'dart:io';

import 'package:flutter/services.dart';

/// Pont natif : installe un APK depuis le stockage **interne** de l’app.
abstract final class CloudityOtaInstaller {
  static const _channel = MethodChannel('cloudity_ota_installer');

  static Future<bool> canInstallPackages() async {
    if (!Platform.isAndroid) return false;
    final ok = await _channel.invokeMethod<bool>('canInstallPackages');
    return ok ?? false;
  }

  /// Ouvre les réglages « installer des apps inconnues » pour cette app.
  static Future<void> openInstallPermissionSettings() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('openInstallPermissionSettings');
  }

  /// Lance l’UI système d’installation sur [apkFile] (cache app uniquement).
  static Future<void> installApk(File apkFile) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('OTA install Android uniquement');
    }
    await _channel.invokeMethod<void>('installApk', {
      'path': apkFile.absolute.path,
    });
  }
}
