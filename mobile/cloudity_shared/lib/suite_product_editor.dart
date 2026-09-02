import 'package:flutter/material.dart';

import 'calendar_repeat.dart';
import 'cloudity_datetime.dart';
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
}) async {
  switch (product) {
    case SuiteProduct.notes:
      return _editNote(context, api, existing);
    case SuiteProduct.contacts:
      return _editContact(context, api, existing);
    case SuiteProduct.tasks:
      return _editTask(context, api, existing, taskListId);
    case SuiteProduct.calendar:
      return _editEvent(context, api, existing);
  }
}

Future<bool> _editNote(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing,
) async {
  final titleCtrl = TextEditingController(
    text: existing?['title']?.toString() ?? '',
  );
  final bodyCtrl = TextEditingController(
    text: (existing?['content'] ?? existing?['body'])?.toString() ?? '',
  );
  var color = existing?['color']?.toString() ?? 'default';
  var pinned = existing?['pinned'] == true;
  var remindAt = parseCloudityDateTime(existing?['remind_at']?.toString());

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
                    existing == null ? 'Nouvelle note' : 'Modifier la note',
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
                    controller: bodyCtrl,
                    minLines: 4,
                    maxLines: 8,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Contenu',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    // ignore: deprecated_member_use
                    value: kNoteColorOptions.any((c) => c.id == color)
                        ? color
                        : 'default',
                    decoration: const InputDecoration(
                      labelText: 'Couleur',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final c in kNoteColorOptions)
                        DropdownMenuItem(value: c.id, child: Text(c.label)),
                    ],
                    onChanged: (v) => setLocal(() => color = v ?? 'default'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Épinglée'),
                    value: pinned,
                    onChanged: (v) => setLocal(() => pinned = v),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Rappel'),
                    subtitle: Text(
                      remindAt == null
                          ? 'Aucun'
                          : formatCloudityDateTimeLocal(_iso(remindAt!)),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (remindAt != null)
                          IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () => setLocal(() => remindAt = null),
                          ),
                        const Icon(Icons.alarm),
                      ],
                    ),
                    onTap: () async {
                      final next = await _pickDateTime(
                        ctx,
                        remindAt ?? DateTime.now().add(const Duration(hours: 1)),
                      );
                      if (next != null) setLocal(() => remindAt = next);
                    },
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
                                await api.createNote(
                                  title: title,
                                  content: bodyCtrl.text,
                                  color: color,
                                  pinned: pinned,
                                  remindAt:
                                      remindAt == null ? null : _iso(remindAt!),
                                );
                              } else {
                                await api.updateNote(
                                  id: id,
                                  title: title,
                                  content: bodyCtrl.text,
                                  color: color,
                                  pinned: pinned,
                                  remindAt:
                                      remindAt == null ? null : _iso(remindAt!),
                                  clearRemindAt: remindAt == null,
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
                  if (existing == null) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: busy
                          ? null
                          : () async {
                              final title = titleCtrl.text.trim();
                              if (title.isEmpty) {
                                setLocal(() => error =
                                    'Titre requis pour créer un événement');
                                return;
                              }
                              setLocal(() {
                                busy = true;
                                error = null;
                              });
                              try {
                                final start =
                                    DateTime.now().add(const Duration(hours: 1));
                                final end = start.add(const Duration(hours: 1));
                                await api.createCalendarEvent(
                                  title: title,
                                  startAt: _iso(start),
                                  endAt: _iso(end),
                                  description: bodyCtrl.text.trim(),
                                );
                                if (ctx.mounted) {
                                  Navigator.pop(ctx, true);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content:
                                          Text('Événement créé dans Agenda'),
                                    ),
                                  );
                                }
                              } catch (e) {
                                setLocal(() {
                                  busy = false;
                                  error = e.toString();
                                });
                              }
                            },
                      icon: const Icon(Icons.event_outlined),
                      label: const Text('Aussi créer un événement Agenda'),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      );
    },
  );
  titleCtrl.dispose();
  bodyCtrl.dispose();
  return saved == true;
}

Future<bool> _editContact(
  BuildContext context,
  SuiteProductApi api,
  Map<String, dynamic>? existing,
) async {
  final profile = existing?['profile'];
  final profileMap = profile is Map
      ? Map<String, dynamic>.from(profile)
      : <String, dynamic>{};

  final nameCtrl = TextEditingController(
    text: existing?['name']?.toString() ??
        existing?['display_name']?.toString() ??
        '',
  );
  final emailCtrl = TextEditingController(
    text: existing?['email']?.toString() ?? '',
  );
  final phoneCtrl = TextEditingController(
    text: existing?['phone']?.toString() ?? '',
  );
  final orgCtrl = TextEditingController(
    text: profileMap['organization']?.toString() ?? '',
  );
  final jobCtrl = TextEditingController(
    text: profileMap['job_title']?.toString() ?? '',
  );
  final notesCtrl = TextEditingController(
    text: profileMap['notes']?.toString() ?? '',
  );
  final birthdayCtrl = TextEditingController(
    text: profileMap['birthday']?.toString() ?? '',
  );

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
                    existing == null ? 'Nouveau contact' : 'Modifier le contact',
                    style: Theme.of(ctx).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Nom',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'E-mail',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Téléphone',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: orgCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Organisation',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: jobCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Poste',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: birthdayCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Anniversaire (AAAA-MM-JJ)',
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
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final name = nameCtrl.text.trim();
                            final email = emailCtrl.text.trim();
                            if (name.isEmpty && email.isEmpty) {
                              setLocal(() => error = 'Nom ou e-mail requis');
                              return;
                            }
                            setLocal(() {
                              busy = true;
                              error = null;
                            });
                            try {
                              final profilePayload = <String, dynamic>{
                                if (orgCtrl.text.trim().isNotEmpty)
                                  'organization': orgCtrl.text.trim(),
                                if (jobCtrl.text.trim().isNotEmpty)
                                  'job_title': jobCtrl.text.trim(),
                                if (birthdayCtrl.text.trim().isNotEmpty)
                                  'birthday': birthdayCtrl.text.trim(),
                                if (notesCtrl.text.trim().isNotEmpty)
                                  'notes': notesCtrl.text.trim(),
                                if (email.isNotEmpty)
                                  'emails': [
                                    {'label': 'work', 'value': email},
                                  ],
                                if (phoneCtrl.text.trim().isNotEmpty)
                                  'phones': [
                                    {
                                      'label': 'mobile',
                                      'value': phoneCtrl.text.trim(),
                                    },
                                  ],
                              };
                              final id =
                                  existing == null ? null : suiteItemId(existing);
                              final display = name.isEmpty ? email : name;
                              if (id == null) {
                                await api.createContact(
                                  name: display,
                                  email: email,
                                  phone: phoneCtrl.text.trim(),
                                  profile: profilePayload,
                                );
                              } else {
                                await api.updateContact(
                                  id: id,
                                  name: display,
                                  email: email,
                                  phone: phoneCtrl.text.trim(),
                                  profile: profilePayload,
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
  nameCtrl.dispose();
  emailCtrl.dispose();
  phoneCtrl.dispose();
  orgCtrl.dispose();
  jobCtrl.dispose();
  notesCtrl.dispose();
  birthdayCtrl.dispose();
  return saved == true;
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
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Prioritaire'),
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
  Map<String, dynamic>? existing,
) async {
  final titleCtrl = TextEditingController(
    text: existing?['title']?.toString() ?? '',
  );
  final locCtrl = TextEditingController(
    text: existing?['location']?.toString() ?? '',
  );
  final descCtrl = TextEditingController(
    text: existing?['description']?.toString() ?? '',
  );
  var start = parseCloudityDateTime(
        (existing?['start_at'] ?? existing?['starts_at'])?.toString(),
      ) ??
      DateTime.now();
  var end = parseCloudityDateTime(
        (existing?['end_at'] ?? existing?['ends_at'])?.toString(),
      ) ??
      start.add(const Duration(hours: 1));
  var allDay = existing?['all_day'] == true;
  var repeatRule =
      normalizeCalendarRepeat(existing?['repeat_rule']?.toString()) ?? '';

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
                    existing == null
                        ? 'Nouvel événement'
                        : 'Modifier l’événement',
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
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Journée entière'),
                    value: allDay,
                    onChanged: (v) => setLocal(() => allDay = v),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Début'),
                    subtitle: Text(
                      allDay
                          ? formatCloudityDayHeaderFromDate(start)
                          : formatCloudityDateTimeLocal(_iso(start)),
                    ),
                    trailing: const Icon(Icons.schedule),
                    onTap: () async {
                      final next = await _pickDateTime(
                        ctx,
                        start,
                        dateOnly: allDay,
                      );
                      if (next == null) return;
                      setLocal(() {
                        start = next;
                        if (!end.isAfter(start)) {
                          end = start.add(const Duration(hours: 1));
                        }
                      });
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Fin'),
                    subtitle: Text(
                      allDay
                          ? formatCloudityDayHeaderFromDate(end)
                          : formatCloudityDateTimeLocal(_iso(end)),
                    ),
                    trailing: const Icon(Icons.schedule),
                    onTap: () async {
                      final next = await _pickDateTime(
                        ctx,
                        end,
                        dateOnly: allDay,
                      );
                      if (next != null) setLocal(() => end = next);
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
                  const SizedBox(height: 12),
                  TextField(
                    controller: locCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Lieu',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: descCtrl,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      border: OutlineInputBorder(),
                    ),
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
                            if (!end.isAfter(start) && !allDay) {
                              setLocal(
                                  () => error = 'La fin doit être après le début');
                              return;
                            }
                            setLocal(() {
                              busy = true;
                              error = null;
                            });
                            try {
                              var s = start;
                              var e = end;
                              if (allDay) {
                                s = DateTime(s.year, s.month, s.day);
                                e = DateTime(e.year, e.month, e.day)
                                    .add(const Duration(days: 1));
                              }
                              final id =
                                  existing == null ? null : suiteItemId(existing);
                              if (id == null) {
                                await api.createCalendarEvent(
                                  title: title,
                                  startAt: _iso(s),
                                  endAt: _iso(e),
                                  location: locCtrl.text.trim(),
                                  description: descCtrl.text.trim(),
                                  allDay: allDay,
                                  repeatRule:
                                      repeatRule.isEmpty ? null : repeatRule,
                                );
                              } else {
                                await api.updateCalendarEvent(
                                  id: id,
                                  title: title,
                                  startAt: _iso(s),
                                  endAt: _iso(e),
                                  location: locCtrl.text.trim(),
                                  description: descCtrl.text.trim(),
                                  allDay: allDay,
                                  repeatRule: repeatRule,
                                  clearRepeatRule: repeatRule.isEmpty,
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
  locCtrl.dispose();
  descCtrl.dispose();
  return saved == true;
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
