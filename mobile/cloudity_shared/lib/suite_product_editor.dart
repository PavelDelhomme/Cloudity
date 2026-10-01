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
  bool noteAsChecklist = false,
}) async {
  switch (product) {
    case SuiteProduct.notes:
      return _editNote(context, api, existing, asChecklist: noteAsChecklist);
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
  Map<String, dynamic>? existing, {
  bool asChecklist = false,
}) async {
  final titleCtrl = TextEditingController(
    text: existing?['title']?.toString() ?? '',
  );
  final bodyCtrl = TextEditingController(
    text: (existing?['content'] ?? existing?['body'])?.toString() ?? '',
  );
  var color = existing?['color']?.toString() ?? 'default';
  var pinned = existing?['pinned'] == true;
  var archived = existing?['archived'] == true;
  var remindAt = parseCloudityDateTime(existing?['remind_at']?.toString());
  final labelsCtrl = TextEditingController(
    text: () {
      final labels = existing?['labels'];
      if (labels is! List) return '';
      return labels
          .map((e) {
            if (e is String) return e.trim();
            if (e is Map) {
              return (e['name'] ?? e['label'] ?? e['title'])?.toString().trim() ?? '';
            }
            return '';
          })
          .where((s) => s.isNotEmpty)
          .join(', ');
    }(),
  );
  final extrasIn = existing?['extras'];
  final checklist = <({TextEditingController text, bool done})>[];
  if (extrasIn is Map && extrasIn['checklist'] is List) {
    for (final raw in extrasIn['checklist'] as List) {
      if (raw is! Map) continue;
      checklist.add((
        text: TextEditingController(text: raw['text']?.toString() ?? ''),
        done: raw['done'] == true,
      ));
    }
  }
  var showList = asChecklist || checklist.isNotEmpty;

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
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Liste à cocher'),
                    value: showList,
                    onChanged: (v) {
                      setLocal(() {
                        showList = v;
                        if (v && checklist.isEmpty) {
                          checklist.add((
                            text: TextEditingController(),
                            done: false,
                          ));
                        }
                      });
                    },
                  ),
                  if (showList) ...[
                    for (var i = 0; i < checklist.length; i++)
                      Row(
                        children: [
                          Checkbox(
                            value: checklist[i].done,
                            onChanged: (v) => setLocal(() {
                              checklist[i] = (
                                text: checklist[i].text,
                                done: v ?? false,
                              );
                            }),
                          ),
                          Expanded(
                            child: TextField(
                              controller: checklist[i].text,
                              decoration: const InputDecoration(
                                hintText: 'Élément',
                                isDense: true,
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => setLocal(() => checklist.removeAt(i)),
                          ),
                        ],
                      ),
                    TextButton.icon(
                      onPressed: () => setLocal(() {
                        checklist.add((
                          text: TextEditingController(),
                          done: false,
                        ));
                      }),
                      icon: const Icon(Icons.add),
                      label: const Text('Ajouter un élément'),
                    ),
                  ],
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
                  if (existing != null)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Archivée'),
                      value: archived,
                      onChanged: (v) => setLocal(() => archived = v),
                    ),
                  TextField(
                    controller: labelsCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Libellés',
                      hintText: 'courses, idées, perso',
                      border: OutlineInputBorder(),
                    ),
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
                              final extras = <String, dynamic>{
                                'checklist': [
                                  for (var i = 0; i < checklist.length; i++)
                                    if (checklist[i].text.text.trim().isNotEmpty)
                                      {
                                        'id': 'cl-$i',
                                        'text': checklist[i].text.text.trim(),
                                        'done': checklist[i].done,
                                      },
                                ],
                              };
                              final labels = labelsCtrl.text
                                  .split(RegExp(r'[,;]'))
                                  .map((s) => s.trim())
                                  .where((s) => s.isNotEmpty)
                                  .toList();
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
                                  labels: labels,
                                  extras: extras,
                                );
                              } else {
                                await api.updateNote(
                                  id: id,
                                  title: title,
                                  content: bodyCtrl.text,
                                  color: color,
                                  pinned: pinned,
                                  archived: archived,
                                  remindAt:
                                      remindAt == null ? null : _iso(remindAt!),
                                  clearRemindAt: remindAt == null,
                                  labels: labels,
                                  extras: extras,
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
  final extraEmailCtrl = TextEditingController(
    text: () {
      final emails = profileMap['emails'];
      if (emails is! List) return '';
      final primary = (existing?['email']?.toString() ?? '').trim().toLowerCase();
      final extras = <String>[];
      for (final e in emails) {
        String? v;
        if (e is String) {
          v = e;
        } else if (e is Map) {
          v = e['value']?.toString();
        }
        final t = (v ?? '').trim();
        if (t.isEmpty) continue;
        if (t.toLowerCase() == primary) continue;
        extras.add(t);
      }
      return extras.join(', ');
    }(),
  );
  final birthdayCtrl = TextEditingController(
    text: profileMap['birthday']?.toString() ?? '',
  );
  Map<String, dynamic> firstAddress() {
    final raw = profileMap['addresses'];
    if (raw is List && raw.isNotEmpty && raw.first is Map) {
      return Map<String, dynamic>.from(raw.first as Map);
    }
    return {};
  }

  final addr0 = firstAddress();
  final streetCtrl = TextEditingController(text: addr0['street']?.toString() ?? '');
  final postalCtrl = TextEditingController(
    text: addr0['postal_code']?.toString() ?? '',
  );
  final cityCtrl = TextEditingController(text: addr0['city']?.toString() ?? '');

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
                    controller: extraEmailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'E-mails secondaires',
                      hintText: 'séparés par des virgules',
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
                    controller: streetCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Adresse',
                      hintText: 'Rue, numéro',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: postalCtrl,
                    keyboardType: TextInputType.streetAddress,
                    decoration: const InputDecoration(
                      labelText: 'Code postal',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: cityCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Ville',
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
                            final phone = phoneCtrl.text.trim();
                            if (name.isEmpty && email.isEmpty && phone.isEmpty) {
                              setLocal(() =>
                                  error = 'Nom, e-mail ou téléphone requis');
                              return;
                            }
                            setLocal(() {
                              busy = true;
                              error = null;
                            });
                            try {
                              final extraEmails = extraEmailCtrl.text
                                  .split(RegExp(r'[,;]'))
                                  .map((s) => s.trim())
                                  .where((s) => s.contains('@'))
                                  .toList();
                              final emailEntries = <Map<String, String>>[
                                if (email.isNotEmpty)
                                  {'label': 'work', 'value': email},
                                for (final extra in extraEmails)
                                  if (extra.toLowerCase() != email.toLowerCase())
                                    {'label': 'other', 'value': extra},
                              ];
                              final profilePayload = <String, dynamic>{
                                if (orgCtrl.text.trim().isNotEmpty)
                                  'organization': orgCtrl.text.trim(),
                                if (jobCtrl.text.trim().isNotEmpty)
                                  'job_title': jobCtrl.text.trim(),
                                if (birthdayCtrl.text.trim().isNotEmpty)
                                  'birthday': birthdayCtrl.text.trim(),
                                if (notesCtrl.text.trim().isNotEmpty)
                                  'notes': notesCtrl.text.trim(),
                                if (emailEntries.isNotEmpty) 'emails': emailEntries,
                                if (phone.isNotEmpty)
                                  'phones': [
                                    {
                                      'label': 'mobile',
                                      'value': phone,
                                    },
                                  ],
                              };
                              final street = streetCtrl.text.trim();
                              final postal = postalCtrl.text.trim();
                              final city = cityCtrl.text.trim();
                              if (street.isNotEmpty || postal.isNotEmpty || city.isNotEmpty) {
                                profilePayload['addresses'] = [
                                  {
                                    'label': 'home',
                                    if (street.isNotEmpty) 'street': street,
                                    if (postal.isNotEmpty) 'postal_code': postal,
                                    if (city.isNotEmpty) 'city': city,
                                  },
                                ];
                              }
                              final id =
                                  existing == null ? null : suiteItemId(existing);
                              final display = name.isNotEmpty
                                  ? name
                                  : (email.isNotEmpty ? email : phone);
                              if (id == null) {
                                await api.createContact(
                                  name: display,
                                  email: email,
                                  phone: phone,
                                  profile: profilePayload,
                                );
                              } else {
                                await api.updateContact(
                                  id: id,
                                  name: display,
                                  email: email,
                                  phone: phone,
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
  extraEmailCtrl.dispose();
  phoneCtrl.dispose();
  orgCtrl.dispose();
  jobCtrl.dispose();
  notesCtrl.dispose();
  birthdayCtrl.dispose();
  streetCtrl.dispose();
  postalCtrl.dispose();
  cityCtrl.dispose();
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
  List<Map<String, dynamic>> contactOpts = const [];
  try {
    contactOpts = await api.fetchContacts();
  } catch (_) {}
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
  final guestsRaw = existing?['attendees'];
  final guestsCtrl = TextEditingController(
    text: guestsRaw is List
        ? guestsRaw.map((e) => e.toString()).where((s) => s.trim().isNotEmpty).join(', ')
        : (guestsRaw?.toString() ?? ''),
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
                  const SizedBox(height: 12),
                  Autocomplete<String>(
                    optionsBuilder: (text) {
                      final q = text.text.split(RegExp(r'[,;]')).last.trim().toLowerCase();
                      if (q.isEmpty) return const Iterable<String>.empty();
                      final out = <String>[];
                      for (final c in contactOpts) {
                        final name = (c['name'] ?? c['display_name'] ?? '').toString();
                        final email = (c['email'] ?? '').toString();
                        if (email.isEmpty || !email.contains('@')) continue;
                        if (name.toLowerCase().contains(q) || email.toLowerCase().contains(q)) {
                          out.add('$name <$email>'.trim());
                        }
                      }
                      return out.take(8);
                    },
                    onSelected: (opt) {
                      final m = RegExp(r'<([^>]+)>').firstMatch(opt);
                      final email = m?.group(1) ?? opt;
                      final bits = guestsCtrl.text.split(RegExp(r'[,;]'));
                      bits.removeLast();
                      final kept = bits.map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
                      kept.add(email.trim());
                      guestsCtrl.text = kept.join(', ');
                      guestsCtrl.selection = TextSelection.collapsed(offset: guestsCtrl.text.length);
                    },
                    fieldViewBuilder: (context, textCtrl, focus, onSubmit) {
                      if (textCtrl.text.isEmpty && guestsCtrl.text.isNotEmpty) {
                        textCtrl.text = guestsCtrl.text;
                      }
                      return TextField(
                        controller: textCtrl,
                        focusNode: focus,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Invités (Hubera Contacts)',
                          hintText: 'nom ou e-mail',
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (v) => guestsCtrl.text = v,
                      );
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
                                  attendees: guestsCtrl.text
                                      .split(RegExp(r'[,;]'))
                                      .map((x) => x.trim())
                                      .where((x) => x.contains('@'))
                                      .toList(),
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
                                  attendees: guestsCtrl.text
                                      .split(RegExp(r'[,;]'))
                                      .map((x) => x.trim())
                                      .where((x) => x.contains('@'))
                                      .toList(),
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
  guestsCtrl.dispose();
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
