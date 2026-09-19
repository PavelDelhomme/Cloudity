import 'dart:io';

import 'package:flutter/services.dart';

/// Pont natif : installe un APK depuis le stockage interne de l’app.
abstract final class HuberaOtaInstaller {
  static const _channel = MethodChannel('hubera_ota_installer');

  static Future<bool> canInstallPackages() async {
    if (!Platform.isAndroid) return false;
    final ok = await _channel.invokeMethod<bool>('canInstallPackages');
    return ok ?? false;
  }

  static Future<void> openInstallPermissionSettings() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('openInstallPermissionSettings');
  }

  static Future<void> installApk(File apkFile) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('OTA install Android uniquement');
    }
    await _channel.invokeMethod<void>('installApk', {
      'path': apkFile.absolute.path,
    });
  }
}

/// Alias transitoire — anciens imports Cloudity.
typedef CloudityOtaInstaller = HuberaOtaInstaller;
