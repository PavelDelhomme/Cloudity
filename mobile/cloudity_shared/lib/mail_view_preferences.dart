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

  static Future<Map<String, dynamic>> _readMap(
    SharedPreferences prefs,
    String email,
    int? tenantId,
  ) async {
    final raw = prefs.getString(scopedKey(tenantId, email));
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return {};
  }

  static List<int> _parseOrder(dynamic raw) {
    if (raw is! List) return const [];
    final out = <int>[];
    for (final item in raw) {
      final id = item is int
          ? item
          : item is num
              ? item.toInt()
              : int.tryParse(item?.toString() ?? '');
      if (id != null && id > 0 && !out.contains(id)) out.add(id);
    }
    return out;
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

  static Future<List<int>> loadOrder({
    required String email,
    int? tenantId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final map = await _readMap(prefs, email, tenantId);
    return _parseOrder(map['accountOrder']);
  }

  static Future<void> save({
    required String email,
    int? tenantId,
    int? accountId,
    required String folder,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final existing = await _readMap(prefs, email, tenantId);
    final payload = <String, dynamic>{
      'accountId': accountId,
      'folder': _parseFolder(folder),
    };
    final order = _parseOrder(existing['accountOrder']);
    if (order.isNotEmpty) payload['accountOrder'] = order;
    await prefs.setString(scopedKey(tenantId, email), jsonEncode(payload));
    await prefs.remove(_legacyMobileKey(email));
  }

  static Future<void> saveOrder({
    required String email,
    int? tenantId,
    required List<int> accountOrder,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final existing = await _readMap(prefs, email, tenantId);
    final folder = _parseFolder(existing['folder']?.toString());
    final idRaw = existing['accountId'];
    final accountId = idRaw is int
        ? idRaw
        : idRaw is num
            ? idRaw.toInt()
            : int.tryParse(idRaw?.toString() ?? '');
    final payload = <String, dynamic>{
      'accountId': accountId != null && accountId > 0 ? accountId : null,
      'folder': existing.isEmpty ? MailStandardFolders.inbox : folder,
      'accountOrder': _parseOrder(accountOrder),
    };
    await prefs.setString(scopedKey(tenantId, email), jsonEncode(payload));
    await prefs.remove(_legacyMobileKey(email));
  }
}
