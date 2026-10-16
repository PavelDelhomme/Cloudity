import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Lecture du carnet Android (compte Google déjà sur le téléphone).
/// Aucun mot de passe Gmail : le système a déjà le compte.
class DeviceGoogleContacts {
  static const channelName = 'cloud.hubera.contacts/device_google';
  static const MethodChannel _channel = MethodChannel(channelName);

  static bool get _android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Ne montre pas de dialogue. À appeler seulement après un geste utilisateur.
  static Future<bool> permissionGranted() async {
    if (!_android) return false;
    try {
      return await _channel.invokeMethod<bool>('permissionGranted') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Dialogue système. Réservé au geste (bouton), jamais au démarrage.
  static Future<bool> requestPermission() async {
    if (!_android) return false;
    try {
      return await _channel.invokeMethod<bool>('requestPermission') ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<List<Map<String, dynamic>>> read() async {
    if (!_android) return const [];
    final raw = await _channel.invokeMethod<List<dynamic>>('readGoogleContacts');
    if (raw == null) return const [];
    return [
      for (final row in raw)
        if (row is Map) Map<String, dynamic>.from(row),
    ];
  }
}
