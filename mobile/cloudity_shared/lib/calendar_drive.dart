import 'dart:convert';

/// Fichier Hubera Drive cité par un événement. Pas de secret : id + nom seulement.
class DriveFileRef {
  const DriveFileRef({required this.id, required this.name});

  final int id;
  final String name;

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

/// Fichiers (pas les dossiers) d’une réponse `/drive/nodes`.
List<DriveFileRef> parseDriveFileList(dynamic data) {
  final list = data is List
      ? data
      : (data is Map ? (data['items'] ?? data['nodes']) : null);
  if (list is! List) return const [];
  final out = <DriveFileRef>[];
  for (final raw in list) {
    if (raw is! Map) continue;
    if (raw['is_folder'] == true) continue;
    final idRaw = raw['id'];
    final id = idRaw is int ? idRaw : int.tryParse(idRaw?.toString() ?? '');
    if (id == null || id <= 0) continue;
    final name = (raw['name'] ?? 'Fichier').toString().trim();
    if (name.isEmpty) continue;
    out.add(DriveFileRef(id: id, name: name));
    if (out.length >= 40) break;
  }
  return out;
}

List<DriveFileRef> readEventAttachments(dynamic raw) {
  dynamic data = raw;
  if (data is String) {
    final s = data.trim();
    if (s.isEmpty) return const [];
    try {
      data = jsonDecode(s);
    } catch (_) {
      return const [];
    }
  }
  if (data is! List) return const [];
  return parseDriveFileList(data);
}

/// Message affiché quand Drive ne répond pas. Le bouton ne plante pas.
const String kHuberaDriveMissingMessage =
    'Il faut Hubera Drive. Ce compte n’a pas de Drive joignable : '
    'ouvre Hubera Drive avec le même compte Hubera ID, puis reviens joindre le fichier.';
