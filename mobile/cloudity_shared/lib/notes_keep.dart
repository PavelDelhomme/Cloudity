import 'package:flutter/material.dart';

export 'notes_keep_editor.dart';

/// Une note mise à la corbeille est effacée définitivement 60 jours plus tard.
const int kNoteTrashRetentionDays = 60;

/// Date de suppression définitive : mise à la corbeille + 60 jours.
DateTime noteTrashExpiresAt(DateTime trashedAt) =>
    trashedAt.add(const Duration(days: kNoteTrashRetentionDays));

/// Vrai seulement si [now] est passé ou égal à la date d’expiration.
bool noteTrashIsExpired({
  required DateTime trashedAt,
  required DateTime now,
}) =>
    !noteTrashExpiresAt(trashedAt).isAfter(now);

/// Identifiants à supprimer. Une note absente de [trashedAtById] n’est jamais retournée.
List<int> noteIdsDueForPermanentDelete({
  required Map<String, String> trashedAtById,
  required DateTime now,
}) {
  final due = <int>[];
  for (final entry in trashedAtById.entries) {
    final id = int.tryParse(entry.key);
    final at = DateTime.tryParse(entry.value);
    if (id == null || at == null) continue;
    if (noteTrashIsExpired(trashedAt: at, now: now)) due.add(id);
  }
  return due;
}

/// Noms de libellés d’une note (chaînes ou objets `{name}`).
List<String> noteLabelNames(Map<String, dynamic> item) {
  final labels = item['labels'];
  final bits = <String>[];
  if (labels is! List) return bits;
  for (final label in labels) {
    if (label is String && label.trim().isNotEmpty) {
      bits.add(label.trim());
    } else if (label is Map) {
      final name = (label['name'] ?? label['label'] ?? label['title'])?.toString();
      if (name != null && name.trim().isNotEmpty) bits.add(name.trim());
    }
  }
  return bits;
}

/// Libellés créés par l’utilisateur, plus ceux déjà posés sur des notes.
List<String> noteLabelCatalog({
  required Iterable<String> custom,
  required Iterable<Map<String, dynamic>> fromNotes,
}) {
  final seen = <String, String>{};
  void add(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return;
    final clipped = trimmed.length > 64 ? trimmed.substring(0, 64) : trimmed;
    seen.putIfAbsent(clipped.toLowerCase(), () => clipped);
  }

  for (final label in custom) {
    add(label);
  }
  for (final note in fromNotes) {
    for (final label in noteLabelNames(note)) {
      add(label);
    }
  }
  final list = seen.values.toList()
    ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
  return list;
}

/// Texte des cases, pour la recherche de la liste.
String noteChecklistPlain(Map<String, dynamic> item) {
  final extras = item['extras'];
  if (extras is! Map || extras['checklist'] is! List) return '';
  final bits = <String>[];
  for (final raw in extras['checklist'] as List) {
    if (raw is! Map) continue;
    final text = raw['text']?.toString().trim() ?? '';
    if (text.isNotEmpty) bits.add(text);
  }
  return bits.join(' ');
}

enum NotesHomeSection { notes, reminders, archive, trash }

/// Entrées du drawer Notes : libellés et corbeille, jamais les autres apps.
List<Widget> buildNotesDrawerTiles({
  required NotesHomeSection section,
  required String? selectedLabel,
  required List<String> labels,
  required void Function(NotesHomeSection section) onSection,
  required void Function(String label) onLabel,
  required VoidCallback onAddLabel,
  bool highlight = true,
}) {
  final onNotes = highlight && section == NotesHomeSection.notes && selectedLabel == null;
  return [
    ListTile(
      leading: const Icon(Icons.lightbulb_outline),
      title: const Text('Notes'),
      selected: onNotes,
      onTap: () => onSection(NotesHomeSection.notes),
    ),
    ListTile(
      leading: const Icon(Icons.notifications_outlined),
      title: const Text('Rappels'),
      selected: highlight && section == NotesHomeSection.reminders,
      onTap: () => onSection(NotesHomeSection.reminders),
    ),
    ListTile(
      leading: const Icon(Icons.archive_outlined),
      title: const Text('Archive'),
      selected: highlight && section == NotesHomeSection.archive,
      onTap: () => onSection(NotesHomeSection.archive),
    ),
    ListTile(
      leading: const Icon(Icons.delete_outline),
      title: const Text('Corbeille'),
      selected: highlight && section == NotesHomeSection.trash,
      onTap: () => onSection(NotesHomeSection.trash),
    ),
    const Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text('Libellés'),
    ),
    for (final label in labels)
      ListTile(
        leading: const Icon(Icons.label_outline),
        title: Text(label),
        selected: highlight && selectedLabel == label && section == NotesHomeSection.notes,
        onTap: () => onLabel(label),
      ),
    ListTile(
      leading: const Icon(Icons.add),
      title: const Text('Ajouter un libellé'),
      onTap: onAddLabel,
    ),
  ];
}
