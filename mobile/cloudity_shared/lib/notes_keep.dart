import 'package:flutter/material.dart';

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

const notesComposerTitleKey = Key('notes-composer-title');
const notesComposerBodyKey = Key('notes-composer-body');
const notesComposerSaveKey = Key('notes-composer-save');
const notesComposerDismissKey = Key('notes-composer-dismiss');

class NotesComposerDraft {
  const NotesComposerDraft({required this.title, required this.content});

  final String title;
  final String content;
}

/// Feuille du bas : titre et contenu saisissables sans changer d’écran.
Future<NotesComposerDraft?> showNotesKeepComposer(BuildContext context) {
  final scheme = Theme.of(context).colorScheme;
  return showModalBottomSheet<NotesComposerDraft>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: false,
    enableDrag: true,
    isDismissible: true,
    backgroundColor: scheme.surface,
    builder: (ctx) => const NotesKeepComposerSheet(),
  );
}

class NotesKeepComposerSheet extends StatefulWidget {
  const NotesKeepComposerSheet({super.key});

  @override
  State<NotesKeepComposerSheet> createState() => _NotesKeepComposerSheetState();
}

class _NotesKeepComposerSheetState extends State<NotesKeepComposerSheet> {
  final _title = TextEditingController();
  final _body = TextEditingController();

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  void _save() {
    final title = _title.text.trim();
    final content = _body.text;
    if (title.isEmpty && content.trim().isEmpty) {
      Navigator.pop(context);
      return;
    }
    Navigator.pop(
      context,
      NotesComposerDraft(title: title, content: content),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final mq = MediaQuery.of(context);
    final titleStyle = theme.textTheme.titleLarge?.copyWith(
      color: scheme.onSurface,
      fontWeight: FontWeight.w600,
    );
    final bodyStyle = theme.textTheme.bodyLarge?.copyWith(
      color: scheme.onSurface,
      height: 1.35,
    );
    final bottomSafe = mq.viewInsets.bottom > 0
        ? 0.0
        : (mq.padding.bottom > mq.viewPadding.bottom ? mq.padding.bottom : mq.viewPadding.bottom);
    final available = mq.size.height - mq.padding.top - bottomSafe - mq.viewInsets.bottom;
    final maxHeight = available * 0.78;
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom + bottomSafe),
      child: Column(
        children: [
          Expanded(
            child: GestureDetector(
              key: notesComposerDismissKey,
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.pop(context),
            ),
          ),
          Material(
          color: scheme.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          clipBehavior: Clip.antiAlias,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxHeight.clamp(220, available)),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                    children: [
                      TextField(
                        key: notesComposerTitleKey,
                        controller: _title,
                        style: titleStyle,
                        cursorColor: scheme.primary,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: 'Titre',
                          hintStyle: titleStyle?.copyWith(color: scheme.onSurfaceVariant),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                      TextField(
                        key: notesComposerBodyKey,
                        controller: _body,
                        autofocus: true,
                        style: bodyStyle,
                        cursorColor: scheme.primary,
                        minLines: 5,
                        maxLines: 12,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: 'Note',
                          hintStyle: bodyStyle?.copyWith(color: scheme.onSurfaceVariant),
                          border: InputBorder.none,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      key: notesComposerSaveKey,
                      onPressed: _save,
                      child: const Text('Enregistrer'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          ),
        ],
      ),
    );
  }
}
