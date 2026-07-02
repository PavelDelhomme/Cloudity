import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'mail_constants.dart';

/// Persistance boîte + dossier mail (clé unifiée web/mobile : tenant + email).
class MailViewPreferences {
  MailViewPreferences._();

  static String scopedKey(int? tenantId, String email) {
    final t = tenantId ?? 0;
    final e = email.trim().toLowerCase();
    return 'cloudity.mail.view.v1:$t:$e';
  }

  /// Ancienne clé mobile (email seul) — migrée à la lecture.
  static String _legacyMobileKey(String email) =>
      'cloudity.mail.view.v1:${email.trim().toLowerCase()}';

  static String _parseFolder(String? raw) {
    final f = (raw ?? '').trim();
    if (f.isEmpty) return MailStandardFolders.inbox;
    if (MailStandardFolders.isStandard(f)) return f.toLowerCase();
    if (f.length <= 512) return f;
    return MailStandardFolders.inbox;
  }

  static Future<({int? accountId, String folder})> load({
    required String email,
    int? tenantId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    var raw = prefs.getString(scopedKey(tenantId, email));
    raw ??= prefs.getString(_legacyMobileKey(email));
    if (raw == null || raw.isEmpty) {
      return (accountId: null, folder: MailStandardFolders.inbox);
    }
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final idRaw = map['accountId'];
      final accountId = idRaw is int
          ? idRaw
          : idRaw is num
              ? idRaw.toInt()
              : int.tryParse(idRaw?.toString() ?? '');
      final folder = _parseFolder(map['folder']?.toString());
      return (
        accountId: accountId != null && accountId > 0 ? accountId : null,
        folder: folder,
      );
    } catch (_) {
      return (accountId: null, folder: MailStandardFolders.inbox);
    }
  }

  static Future<void> save({
    required String email,
    int? tenantId,
    int? accountId,
    required String folder,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final payload = jsonEncode({
      'accountId': accountId,
      'folder': _parseFolder(folder),
    });
    await prefs.setString(scopedKey(tenantId, email), payload);
    await prefs.remove(_legacyMobileKey(email));
  }
}
