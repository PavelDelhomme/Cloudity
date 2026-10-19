import 'package:flutter/material.dart';

import 'calendar_event_page.dart';
import 'calendar_repeat.dart';
import 'cloudity_datetime.dart';
import 'contact_editor.dart';
import 'notes_keep.dart';
import 'suite_bottom_sheet.dart';
import 'suite_product_api.dart';
import 'suite_product_home.dart';

int? suiteItemId(Map<String, dynamic> item) {
  final id = item['id'];
  if (id is int) return id;
  return int.tryParse(id?.toString() ?? '');
}

String _iso(DateTime d) => d.toUtc().toIso8601String();

Future<DateTime?> _pickDateTime(
  BuildContext ctx,
  DateTime initial, {
  bool dateOnly = false,
}) async {
  final d = await showDatePicker(
    context: ctx,
    initialDate: initial,
    firstDate: DateTime(2020),
    lastDate: DateTime(2040),
  );
  if (d == null || !ctx.mounted) return null;
  if (dateOnly) return DateTime(d.year, d.month, d.day, 9);
  final t = await showTimePicker(
    context: ctx,
    initialTime: TimeOfDay.fromDateTime(initial),
  );
  if (t == null) return null;
  return DateTime(d.year, d.month, d.day, t.hour, t.minute);
}

/// Formulaire création / édition aligné sur les APIs Calendar / Contacts / Notes / Tasks.
Future<bool> showSuiteProductEditor({
  required BuildContext context,
  required SuiteProduct product,
  required SuiteProductApi api,
  Map<String, dynamic>? existing,
  int? taskListId,
  bool noteAsChecklist = false,
  DateTime? seedStart,
  DateTime? seedRemind,
  List<Map<String, dynamic>> calendars = const [],
  List<String> noteLabels = const [],
  List<String> noteInitialLabels = const [],
  void Function(String label)? onNoteLabelCreated,
  void Function(Map<String, dynamic> event)? onCalendarSaved,
}) async {
  switch (product) {
    case SuiteProduct.notes:
      return _editNote(
        context,
        api,
        existing,
        asChecklist: noteAsChecklist,
        seedRemind: seedRemind,
        labelCatalog: noteLabels,
        initialLabels: noteInitialLabels,
        onLabelCreated: onNoteLabelCreated,
      );
    case SuiteProduct.contacts:
      return _editContact(context, api, existing);
    case SuiteProduct.tasks:
      return _editTask(context, api, existing, taskListId);
    case SuiteProduct.calendar:
      return _editEvent(
        context,
        api,
        existing,
        seedStart: seedStart,
        calendars: calendars,
        onSaved: onCalendarSaved,
      );
  }
}

Future<int?> _persistNoteKeep(
  SuiteProductApi api,
  Map<String, dynamic>? existing,
  NotesKeepSnapshot snap,
  int? id,
) async {
  final extras = <String, dynamic>{};
  final prev = existing?['extras'];
  if (prev is Map) {
    for (final entry in prev.entries) {
      extras['${entry.key}'] = entry.value;
    }
  }
  extras['checklist'] = [
    for (var i = 0; i < snap.checklist.length; i++)
      if (snap.checklist[i].text.trim().isNotEmpty)
        {
          'id': 'cl-$i',
          'text': snap.checklist[i].text.trim(),
          'done': snap.checklist[i].done,
        },
  ];
  final title = snap.title.trim();
  final content = snap.listMode ? '' : snap.content;
  final remind = snap.remindAt?.toUtc().toIso8601String();
  if (id == null) {
    final created = await api.createNote(
      title: title,
      content: content,
      color: snap.color,
      pinned: snap.pinned,
      remindAt: remind,
      labels: snap.labels,
      extras: extras,
    );
    final raw = created['id'];
    final parsed = raw is int ? raw : int.tryParse(raw?.toString() ?? '');
    if (parsed == null) return null;
    if (snap.archived) {
      await api.updateNote(id: parsed, archived: true);
    }
    return parsed;
  }
  await api.updateNote(
    id: id,
    title: title,
    content: content,
    color: snap.color,
    pinned: snap.pinned,
    archived: snap.archived,
    remindAt: remind,
    clearRemindAt: snap.remindAt == null,
    labels: snap.labels,
    extras: extras,
  );
  return id;
}

Future<bool> _editNote(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing, {
  bool asChecklist = false,
  DateTime? seedRemind,
  List<String> labelCatalog = const [],
  List<String> initialLabels = const [],
  void Function(String label)? onLabelCreated,
}) {
  final labels = existing == null ? initialLabels : noteLabelNames(existing);
  return Navigator.of(context).push<bool>(
    MaterialPageRoute<bool>(
      builder: (_) => NotesKeepEditorScreen(
        existing: existing,
        startAsChecklist: asChecklist,
        seedRemind: seedRemind,
        labelCatalog: labelCatalog,
        initialLabels: labels,
        onLabelCreated: onLabelCreated,
        persist: (snap, id) => _persistNoteKeep(api, existing, snap, id),
        remove: api.deleteNote,
      ),
    ),
  ).then((saved) => saved == true);
}

Future<bool> _editContact(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing,
) {
  return Navigator.of(context).push<bool>(
    MaterialPageRoute<bool>(
      fullscreenDialog: true,
      builder: (_) => ContactEditorScreen(api: api, existing: existing),
    ),
  ).then((saved) => saved == true);
}

Future<bool> _editTask(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing,
  int? taskListId,
) async {
  final titleCtrl = TextEditingController(
    text: existing?['title']?.toString() ?? '',
  );
  final notesCtrl = TextEditingController(
    text: existing?['notes']?.toString() ?? '',
  );
  var startAt = parseCloudityDateTime(existing?['start_at']?.toString());
  var dueAt = parseCloudityDateTime(existing?['due_at']?.toString());
  var repeatRule = normalizeCalendarRepeat(existing?['repeat_rule']?.toString()) ?? '';
  var starred = existing?['starred'] == true;
  var priority = clampTaskPriority(existing?['priority']);

  final saved = await showSuiteModalBottomSheet<bool>(
    context: context,
    builder: (ctx) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return Padding(
            padding: suiteBottomSheetPadding(ctx),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    existing == null ? 'Nouvelle tâche' : 'Modifier la tâche',
                    style: Theme.of(ctx).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: titleCtrl,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Titre',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesCtrl,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Notes',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  Text('Priorité', style: Theme.of(ctx).textTheme.labelLarge),
                  Text(
                    '1 la plus importante, 5 la plus faible',
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (var n = 1; n <= 5; n++)
                        ChoiceChip(
                          label: Text('$n'),
                          selected: priority == n,
                          onSelected: (_) => setLocal(() => priority = n),
                        ),
                    ],
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Étoile'),
                    secondary: Icon(
                      starred ? Icons.star : Icons.star_border,
                      color: starred ? Colors.amber : null,
                    ),
                    value: starred,
                    onChanged: (v) => setLocal(() => starred = v),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Début'),
                    subtitle: Text(
                      startAt == null
                          ? 'Aucun'
                          : formatCloudityDateTimeLocal(_iso(startAt!)),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (startAt != null)
                          IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () => setLocal(() => startAt = null),
                          ),
                        const Icon(Icons.schedule),
                      ],
                    ),
                    onTap: () async {
                      final next = await _pickDateTime(
                        ctx,
                        startAt ?? DateTime.now(),
                      );
                      if (next != null) setLocal(() => startAt = next);
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Échéance'),
                    subtitle: Text(
                      dueAt == null
                          ? 'Aucune'
                          : formatCloudityDateTimeLocal(_iso(dueAt!)),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (dueAt != null)
                          IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () => setLocal(() => dueAt = null),
                          ),
                        const Icon(Icons.event),
                      ],
                    ),
                    onTap: () async {
                      final next = await _pickDateTime(
                        ctx,
                        dueAt ?? DateTime.now().add(const Duration(days: 1)),
                      );
                      if (next != null) setLocal(() => dueAt = next);
                    },
                  ),
                  DropdownButtonFormField<String>(
                    // ignore: deprecated_member_use
                    value: repeatRule,
                    decoration: const InputDecoration(
                      labelText: 'Répétition',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final o in kCalendarRepeatOptions)
                        DropdownMenuItem(value: o.value, child: Text(o.label)),
                    ],
                    onChanged: (v) => setLocal(() => repeatRule = v ?? ''),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final title = titleCtrl.text.trim();
                            if (title.isEmpty) {
                              setLocal(() => error = 'Titre requis');
                              return;
                            }
                            setLocal(() {
                              busy = true;
                              error = null;
                            });
                            try {
                              final id =
                                  existing == null ? null : suiteItemId(existing);
                              if (id == null) {
                                await api.createTask(
                                  title: title,
                                  listId: taskListId,
                                  notes: notesCtrl.text.trim(),
                                  startAt: startAt == null ? null : _iso(startAt!),
                                  dueAt: dueAt == null ? null : _iso(dueAt!),
                                  repeatRule:
                                      repeatRule.isEmpty ? null : repeatRule,
                                  starred: starred,
                                  priority: priority,
                                );
                              } else {
                                await api.updateTask(
                                  id: id,
                                  title: title,
                                  notes: notesCtrl.text.trim(),
                                  startAt: startAt == null ? null : _iso(startAt!),
                                  clearStartAt: startAt == null,
                                  dueAt: dueAt == null ? null : _iso(dueAt!),
                                  clearDueAt: dueAt == null,
                                  repeatRule: repeatRule,
                                  clearRepeatRule: repeatRule.isEmpty,
                                  starred: starred,
                                  priority: priority,
                                );
                              }
                              if (ctx.mounted) Navigator.pop(ctx, true);
                            } catch (e) {
                              setLocal(() {
                                busy = false;
                                error = e.toString();
                              });
                            }
                          },
                    child: Text(busy ? 'Enregistrement…' : 'Enregistrer'),
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
  titleCtrl.dispose();
  notesCtrl.dispose();
  return saved == true;
}

Future<bool> _editEvent(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing, {
  DateTime? seedStart,
  List<Map<String, dynamic>> calendars = const [],
  void Function(Map<String, dynamic> event)? onSaved,
}) {
  return showCalendarEventPage(
    context,
    api: api,
    existing: existing,
    seedStart: seedStart,
    calendars: calendars,
    onSaved: onSaved,
  );
}

Future<bool> confirmSuiteDelete(BuildContext context, String label) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Supprimer ?'),
      content: Text('Supprimer « $label » ?'),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler')),
        FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Supprimer')),
      ],
    ),
  );
  return ok == true;
}
