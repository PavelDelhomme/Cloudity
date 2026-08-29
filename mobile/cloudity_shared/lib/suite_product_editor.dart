import 'package:flutter/material.dart';

import 'cloudity_datetime.dart';
import 'suite_product_api.dart';
import 'suite_product_home.dart';

int? suiteItemId(Map<String, dynamic> item) {
  final id = item['id'];
  if (id is int) return id;
  return int.tryParse(id?.toString() ?? '');
}

String _iso(DateTime d) => d.toUtc().toIso8601String();

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
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              20 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
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
                            final id = existing == null ? null : suiteItemId(existing);
                            if (id == null) {
                              await api.createNote(
                                title: title,
                                content: bodyCtrl.text,
                              );
                            } else {
                              await api.updateNote(
                                id: id,
                                title: title,
                                content: bodyCtrl.text,
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
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              20 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
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
                            final id = existing == null ? null : suiteItemId(existing);
                            if (id == null) {
                              await api.createContact(
                                name: name.isEmpty ? email : name,
                                email: email,
                                phone: phoneCtrl.text.trim(),
                              );
                            } else {
                              await api.updateContact(
                                id: id,
                                name: name.isEmpty ? email : name,
                                email: email,
                                phone: phoneCtrl.text.trim(),
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
          );
        },
      );
    },
  );
  nameCtrl.dispose();
  emailCtrl.dispose();
  phoneCtrl.dispose();
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
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              20 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
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
                            final id = existing == null ? null : suiteItemId(existing);
                            if (id == null) {
                              await api.createTask(
                                title: title,
                                listId: taskListId,
                                notes: notesCtrl.text.trim(),
                              );
                            } else {
                              await api.updateTask(
                                id: id,
                                title: title,
                                notes: notesCtrl.text.trim(),
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

  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          Future<void> pickStart() async {
            final d = await showDatePicker(
              context: ctx,
              initialDate: start,
              firstDate: DateTime(2020),
              lastDate: DateTime(2040),
            );
            if (d == null || !ctx.mounted) return;
            final t = await showTimePicker(
              context: ctx,
              initialTime: TimeOfDay.fromDateTime(start),
            );
            if (t == null) return;
            final next = DateTime(d.year, d.month, d.day, t.hour, t.minute);
            setLocal(() {
              start = next;
              if (!end.isAfter(start)) {
                end = start.add(const Duration(hours: 1));
              }
            });
          }

          Future<void> pickEnd() async {
            final d = await showDatePicker(
              context: ctx,
              initialDate: end,
              firstDate: DateTime(2020),
              lastDate: DateTime(2040),
            );
            if (d == null || !ctx.mounted) return;
            final t = await showTimePicker(
              context: ctx,
              initialTime: TimeOfDay.fromDateTime(end),
            );
            if (t == null) return;
            setLocal(() {
              end = DateTime(d.year, d.month, d.day, t.hour, t.minute);
            });
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              20 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  existing == null ? 'Nouvel événement' : 'Modifier l’événement',
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
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Début'),
                  subtitle: Text(formatCloudityDateTimeLocal(_iso(start))),
                  trailing: const Icon(Icons.schedule),
                  onTap: pickStart,
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Fin'),
                  subtitle: Text(formatCloudityDateTimeLocal(_iso(end))),
                  trailing: const Icon(Icons.schedule),
                  onTap: pickEnd,
                ),
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
                          if (!end.isAfter(start)) {
                            setLocal(() => error = 'La fin doit être après le début');
                            return;
                          }
                          setLocal(() {
                            busy = true;
                            error = null;
                          });
                          try {
                            final id = existing == null ? null : suiteItemId(existing);
                            if (id == null) {
                              await api.createCalendarEvent(
                                title: title,
                                startAt: _iso(start),
                                endAt: _iso(end),
                                location: locCtrl.text.trim(),
                                description: descCtrl.text.trim(),
                              );
                            } else {
                              await api.updateCalendarEvent(
                                id: id,
                                title: title,
                                startAt: _iso(start),
                                endAt: _iso(end),
                                location: locCtrl.text.trim(),
                                description: descCtrl.text.trim(),
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
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Supprimer')),
      ],
    ),
  );
  return ok == true;
}
