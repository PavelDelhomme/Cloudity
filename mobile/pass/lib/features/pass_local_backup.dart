import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Format `cloudity-pass-backup-v1` — blobs chiffrés uniquement (zero-access).
/// Spec : docs/produit/PASS-BACKUP.md
class PassLocalBackupStore {
  PassLocalBackupStore._();

  static const schema = 'cloudity-pass-backup-v1';

  static Future<File> _fileForUser(String userId) async {
    final dir = await getApplicationDocumentsDirectory();
    final safeId = userId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return File(p.join(dir.path, 'cloudity_pass_backup_$safeId.json'));
  }

  static Map<String, dynamic> buildDocument({
    required String userId,
    required List<Map<String, dynamic>> vaults,
  }) {
    return {
      'schema': schema,
      'exported_at': DateTime.now().toUtc().toIso8601String(),
      'user_id': userId,
      'app': 'cloudity-pass',
      'vaults': vaults,
    };
  }

  static Future<void> save({
    required String userId,
    required List<Map<String, dynamic>> vaults,
  }) async {
    if (userId.isEmpty) return;
    final doc = buildDocument(userId: userId, vaults: vaults);
    final file = await _fileForUser(userId);
    await file.writeAsString(jsonEncode(doc));
  }

  static Future<Map<String, dynamic>?> load(String userId) async {
    if (userId.isEmpty) return null;
    final file = await _fileForUser(userId);
    if (!await file.exists()) return null;
    try {
      final raw = jsonDecode(await file.readAsString());
      if (raw is! Map<String, dynamic>) return null;
      if (raw['schema'] != schema) return null;
      return raw;
    } catch (_) {
      return null;
    }
  }

  static List<Map<String, dynamic>> vaultsFromDocument(Map<String, dynamic>? doc) {
    if (doc == null) return const [];
    final vaults = doc['vaults'];
    if (vaults is! List) return const [];
    return vaults.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static List<Map<String, dynamic>> itemsForVault(
    Map<String, dynamic>? doc,
    int vaultId,
  ) {
    for (final v in vaultsFromDocument(doc)) {
      final id = v['id'];
      if (id is int && id == vaultId) {
        final items = v['items'];
        if (items is List) {
          return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
      }
    }
    return const [];
  }

  static String? exportedAtLabel(Map<String, dynamic>? doc) {
    final at = doc?['exported_at'];
    return at is String ? at : null;
  }

  /// Construit le document à partir des réponses API brutes.
  static Future<void> saveFromApi({
    required String userId,
    required List<Map<String, dynamic>> vaultRows,
    required Future<List<Map<String, dynamic>>> Function(int vaultId) fetchItems,
  }) async {
    final vaults = <Map<String, dynamic>>[];
    for (final v in vaultRows) {
      final id = (v['id'] as int?) ?? 0;
      if (id <= 0) continue;
      final items = await fetchItems(id);
      vaults.add({
        'id': id,
        'name': v['name'] ?? 'Coffre #$id',
        if (v['created_at'] != null) 'created_at': v['created_at'],
        if (v['updated_at'] != null) 'updated_at': v['updated_at'],
        'items': items
            .map((it) => {
                  'id': it['id'],
                  'ciphertext': it['ciphertext'],
                  'format_version': it['format_version'] ?? 1,
                  if (it['created_at'] != null) 'created_at': it['created_at'],
                  if (it['updated_at'] != null) 'updated_at': it['updated_at'],
                })
            .toList(),
      });
    }
    await save(userId: userId, vaults: vaults);
  }
}
