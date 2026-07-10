import 'dart:async';

import 'package:flutter/services.dart';

import 'user_preferences.dart';

/// Copie avec auto-effacement selon les préférences Pass utilisateur.
class PassClipboard {
  PassClipboard._();

  static Timer? _clearTimer;

  static Future<bool> copy(
    String value, {
    required PassAppSettings prefs,
    Duration? ttlOverride,
  }) async {
    if (!prefs.clipboardEnabled) return false;
    await Clipboard.setData(ClipboardData(text: value));
    final ttlMs = ttlOverride?.inMilliseconds ?? prefs.clipboardClearMs;
    _scheduleClear(value, ttlMs);
    return true;
  }

  static void _scheduleClear(String copied, int ttlMs) {
    _clearTimer?.cancel();
    if (ttlMs <= 0) return;
    _clearTimer = Timer(Duration(milliseconds: ttlMs), () async {
      try {
        final current = await Clipboard.getData(Clipboard.kTextPlain);
        if (current?.text == copied) {
          await Clipboard.setData(const ClipboardData(text: ''));
        }
      } catch (_) {
        // Best-effort — l'utilisateur a peut-être copié autre chose entre-temps.
      }
    });
  }

  static void cancelPendingClear() => _clearTimer?.cancel();
}
