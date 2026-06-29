import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const _standardFolders = {
  'inbox',
  'sent',
  'drafts',
  'archive',
  'spam',
  'trash',
  'all',
  'unified',
  'scheduled',
};

class MailViewPreferences {
  MailViewPreferences._();

  static String _key(String email) =>
      'cloudity.mail.view.v1:${email.trim().toLowerCase()}';

  static String _parseFolder(String? raw) {
    final f = (raw ?? '').trim();
    if (f.isEmpty) return 'inbox';
    if (_standardFolders.contains(f)) return f;
    if (f.length <= 512) return f;
    return 'inbox';
  }

  static Future<({int? accountId, String folder})> load(String email) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(email));
    if (raw == null || raw.isEmpty) {
      return (accountId: null, folder: 'inbox');
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
      return (accountId: null, folder: 'inbox');
    }
  }

  static Future<void> save({
    required String email,
    int? accountId,
    required String folder,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key(email),
      jsonEncode({
        'accountId': accountId,
        'folder': _parseFolder(folder),
      }),
    );
  }
}
