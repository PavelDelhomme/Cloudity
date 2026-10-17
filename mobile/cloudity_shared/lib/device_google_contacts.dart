import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'contact_directory.dart';

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

  /// Lecture et écriture déjà accordées. Aucun dialogue.
  static Future<bool> accessGranted() async {
    if (!_android) return false;
    try {
      return await _channel.invokeMethod<bool>('accessGranted') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Dialogue système. Réservé au geste (bouton), jamais au démarrage.
  /// Si l’autorisation est déjà là, le natif répond oui sans redemander.
  static Future<bool> requestPermission() async {
    if (!_android) return false;
    try {
      return await _channel.invokeMethod<bool>('requestPermission') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Une seule demande, et seulement si lecture ou écriture manque.
  static Future<bool> requestAccessOnce() async {
    if (!_android) return false;
    if (await accessGranted()) return true;
    try {
      return await _channel.invokeMethod<bool>('requestAccessOnce') ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<DeviceWriteResult> insertContact({
    required String name,
    String phone = '',
    String email = '',
  }) async {
    if (!_android) {
      return const DeviceWriteResult(ok: false, reason: 'Pas un téléphone Android.');
    }
    try {
      final raw = await _channel.invokeMethod<Map<dynamic, dynamic>>('insertContact', {
        'name': name,
        'phone': phone,
        'email': email,
      });
      return DeviceWriteResult.fromMap(raw);
    } catch (_) {
      return const DeviceWriteResult(
        ok: false,
        reason: 'Le téléphone a refusé l’enregistrement.',
      );
    }
  }

  static Future<DeviceWriteResult> deleteContact({required String lookup}) async {
    if (!_android) {
      return const DeviceWriteResult(ok: false, reason: 'Pas un téléphone Android.');
    }
    try {
      final raw = await _channel.invokeMethod<Map<dynamic, dynamic>>('deleteContact', {
        'lookup': lookup,
      });
      return DeviceWriteResult.fromMap(raw);
    } catch (_) {
      return const DeviceWriteResult(
        ok: false,
        reason: 'Le téléphone a refusé la suppression.',
      );
    }
  }

  static Future<BlockedNumbersView> blockedNumbers() async {
    if (!_android) {
      return const BlockedNumbersView(
        canRead: false,
        canWrite: false,
        reason: 'Pas un téléphone Android.',
        numbers: [],
      );
    }
    try {
      final raw = await _channel.invokeMethod<Map<dynamic, dynamic>>('blockedNumbers');
      return blockedNumbersFromChannel(raw);
    } catch (_) {
      return const BlockedNumbersView(
        canRead: false,
        canWrite: false,
        reason: 'Le téléphone ne donne pas la liste des numéros bloqués.',
        numbers: [],
      );
    }
  }

  /// Bloque seulement si une relecture confirme le numéro. Sinon [blocked] reste faux.
  static Future<BlockAttempt> blockNumber(String number) async {
    return _mutateBlock('blockNumber', number);
  }

  static Future<BlockAttempt> unblockNumber(String number) async {
    if (!_android) {
      return const BlockAttempt(blocked: false, reason: 'Pas un téléphone Android.');
    }
    try {
      final raw = await _channel.invokeMethod<Map<dynamic, dynamic>>('unblockNumber', {
        'number': number,
      });
      if (raw == null || raw['ok'] != true) {
        final reason = (raw?['reason'] ?? '').toString().trim();
        return BlockAttempt(
          blocked: false,
          reason: reason.isEmpty ? 'Le téléphone a refusé de débloquer ce numéro.' : reason,
        );
      }
      final again = await blockedNumbers();
      final still = again.numbers.any((entry) {
        if (entry.trim() == number.trim()) return true;
        final wanted = contactDigits(number);
        final digits = contactDigits(entry);
        return wanted.length >= 8 && digits == wanted;
      });
      if (still) {
        return const BlockAttempt(
          blocked: false,
          reason: 'Le téléphone a gardé ce numéro dans les bloqués.',
        );
      }
      return const BlockAttempt(blocked: true, reason: '');
    } catch (_) {
      return const BlockAttempt(
        blocked: false,
        reason: 'Le téléphone a refusé de débloquer ce numéro.',
      );
    }
  }

  static Future<BlockAttempt> _mutateBlock(String method, String number) async {
    if (!_android) {
      return const BlockAttempt(blocked: false, reason: 'Pas un téléphone Android.');
    }
    try {
      final raw = await _channel.invokeMethod<Map<dynamic, dynamic>>(method, {
        'number': number,
      });
      final again = await blockedNumbers();
      return interpretBlockResult(raw: raw, number: number, reread: again.numbers);
    } catch (_) {
      return const BlockAttempt(
        blocked: false,
        reason: 'Le téléphone a refusé de bloquer ce numéro.',
      );
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

class DeviceWriteResult {
  const DeviceWriteResult({required this.ok, this.reason = '', this.lookup = ''});

  final bool ok;
  final String reason;
  final String lookup;

  static DeviceWriteResult fromMap(Map<dynamic, dynamic>? raw) {
    if (raw == null || raw['ok'] != true) {
      final reason = (raw?['reason'] ?? '').toString().trim();
      return DeviceWriteResult(
        ok: false,
        reason: reason.isEmpty ? 'Le téléphone a refusé.' : reason,
      );
    }
    return DeviceWriteResult(
      ok: true,
      lookup: (raw['lookup'] ?? '').toString(),
    );
  }
}
