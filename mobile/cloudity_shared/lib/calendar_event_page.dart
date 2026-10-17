import 'package:flutter/material.dart';

import 'calendar_drive.dart';
import 'calendar_reminder.dart';
import 'calendar_repeat.dart';
import 'calendar_visibility.dart';
import 'cloudity_datetime.dart';
import 'contact_maps.dart';
import 'suite_product_api.dart';

int? _eventId(Map<String, dynamic>? item) {
  if (item == null) return null;
  final id = item['id'];
  if (id is int) return id;
  return int.tryParse(id?.toString() ?? '');
}

String _iso(DateTime d) => d.toUtc().toIso8601String();

/// Création / édition plein écran : titre, horaire, journée, agenda,
/// répétition, notification, lieu, description, pièce Drive.
Future<bool> showCalendarEventPage(
  BuildContext context, {
  required SuiteProductApi api,
  Map<String, dynamic>? existing,
  DateTime? seedStart,
  List<Map<String, dynamic>> calendars = const [],
  Future<({bool reachable, List<DriveFileRef> files})> Function()? driveProbe,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: FractionallySizedBox(
        heightFactor: 0.94,
        child: CalendarEventPage(
          api: api,
          existing: existing,
          seedStart: seedStart,
          calendars: calendars,
          driveProbe: driveProbe,
        ),
      ),
    ),
  ).then((v) => v == true);
}

class CalendarEventPage extends StatefulWidget {
  const CalendarEventPage({
    super.key,
    required this.api,
    this.existing,
    this.seedStart,
    this.calendars = const [],
    this.driveProbe,
  });

  final SuiteProductApi api;
  final Map<String, dynamic>? existing;
  final DateTime? seedStart;
  final List<Map<String, dynamic>> calendars;
  final Future<({bool reachable, List<DriveFileRef> files})> Function()? driveProbe;

  @override
  State<CalendarEventPage> createState() => _CalendarEventPageState();
}

class _CalendarEventPageState extends State<CalendarEventPage> {
  late final TextEditingController _title;
  late final TextEditingController _location;
  late final TextEditingController _description;
  late final TextEditingController _guests;
  late DateTime _start;
  late DateTime _end;
  late bool _allDay;
  late String _repeat;
  late int _reminder;
  int? _calendarId;
  List<Map<String, dynamic>> _calendars = [];
  List<Map<String, dynamic>> _contacts = const [];
  List<DriveFileRef> _files = const [];
  bool _busy = false;
  String? _error;
  bool _series = false;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _series = existing?['occurrence_key'] != null;
    final seriesStart = parseCloudityDateTime(existing?['series_start_at']?.toString());
    final seriesEnd = parseCloudityDateTime(existing?['series_end_at']?.toString());
    _title = TextEditingController(text: existing?['title']?.toString() ?? '');
    _location = TextEditingController(text: existing?['location']?.toString() ?? '');
    _description = TextEditingController(text: existing?['description']?.toString() ?? '');
    final guestsRaw = existing?['attendees'];
    _guests = TextEditingController(
      text: guestsRaw is List
          ? guestsRaw.map((e) => e.toString()).where((s) => s.trim().isNotEmpty).join(', ')
          : (guestsRaw?.toString() ?? ''),
    );
    _start = seriesStart ??
        parseCloudityDateTime((existing?['start_at'] ?? existing?['starts_at'])?.toString()) ??
        widget.seedStart ??
        DateTime.now();
    _end = seriesEnd ??
        parseCloudityDateTime((existing?['end_at'] ?? existing?['ends_at'])?.toString()) ??
        _start.add(const Duration(hours: 1));
    _allDay = existing?['all_day'] == true;
    _repeat = normalizeCalendarRepeat(existing?['repeat_rule']?.toString()) ?? '';
    _reminder = normalizeCalendarReminder(existing?['reminder_minutes']) ?? -1;
    _calendarId = calendarIdOf(existing ?? const {});
    _files = readEventAttachments(existing?['attachments']);
    _calendars = [
      for (final c in widget.calendars) Map<String, dynamic>.from(c),
    ];
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    if (_calendars.isEmpty) {
      try {
        final list = await widget.api.fetchCalendars();
        if (mounted) setState(() => _calendars = list);
      } catch (_) {}
    }
    try {
      final contacts = await widget.api.fetchContacts();
      if (mounted) setState(() => _contacts = contacts);
    } catch (_) {}
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _description.dispose();
    _guests.dispose();
    super.dispose();
  }

  String _repeatLabel() {
    for (final o in kCalendarRepeatOptions) {
      if (o.value == _repeat) return o.label;
    }
    return 'Pas de répétition';
  }

  String _reminderLabel() {
    for (final o in kCalendarReminderOptions) {
      if (o.minutes == _reminder) return o.label;
    }
    return 'Pas de rappel';
  }

  String _calendarLabel() {
    for (final c in _calendars) {
      if (calendarIdOf(c) == _calendarId) {
        final name = c['name']?.toString().trim() ?? '';
        if (name.isNotEmpty) return name;
      }
    }
    if (_calendars.isNotEmpty) {
      return _calendars.first['name']?.toString() ?? 'Agenda';
    }
    return 'Agenda principal';
  }

  Color _calendarColor(Color fallback) {
    for (final c in _calendars) {
      if (calendarIdOf(c) == _calendarId) {
        return parseCalendarHex(c['color_hex']?.toString()) ?? fallback;
      }
    }
    if (_calendars.isNotEmpty) {
      return parseCalendarHex(_calendars.first['color_hex']?.toString()) ?? fallback;
    }
    return fallback;
  }

  String _dateLabel(DateTime d) {
    const wd = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
    const mo = [
      'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
      'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
    ];
    final w = wd[d.weekday - 1];
    return '${w[0].toUpperCase()}${w.substring(1)} ${d.day} ${mo[d.month - 1]} ${d.year}';
  }

  String _clock(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  Future<void> _applyWhen(DateTime next, {required bool start}) async {
    setState(() {
      if (start) {
        _start = next;
        if (!_end.isAfter(_start)) _end = _start.add(const Duration(hours: 1));
      } else {
        _end = next.isAfter(_start) ? next : _start.add(const Duration(hours: 1));
      }
    });
  }

  Future<void> _pickDate({required bool start}) async {
    final initial = start ? _start : _end;
    final d = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2040),
    );
    if (d == null || !mounted) return;
    await _applyWhen(
      DateTime(d.year, d.month, d.day, initial.hour, initial.minute),
      start: start,
    );
  }

  Future<void> _pickTime({required bool start}) async {
    if (_allDay) return;
    final initial = start ? _start : _end;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (t == null || !mounted) return;
    await _applyWhen(
      DateTime(initial.year, initial.month, initial.day, t.hour, t.minute),
      start: start,
    );
  }

  Future<void> _pickRepeat() async {
    final choice = await _pickSheet<String>(
      title: 'Répétition',
      options: [
        for (final o in kCalendarRepeatOptions) (value: o.value, label: o.label),
      ],
    );
    if (choice == null) return;
    setState(() => _repeat = choice);
  }

  Future<void> _pickReminder() async {
    final choice = await _pickSheet<int>(
      title: 'Notification',
      options: [
        for (final o in kCalendarReminderOptions) (value: o.minutes, label: o.label),
      ],
    );
    if (choice == null) return;
    setState(() => _reminder = choice);
  }

  Future<void> _pickCalendar() async {
    if (_calendars.isEmpty) {
      setState(() => _error = 'Aucun agenda pour l’instant. Réessaie dans un moment.');
      return;
    }
    final choice = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Agenda', style: Theme.of(ctx).textTheme.titleMedium),
              ),
            ),
            for (final c in _calendars)
              ListTile(
                leading: Icon(
                  Icons.circle,
                  color: parseCalendarHex(c['color_hex']?.toString()) ??
                      Theme.of(ctx).colorScheme.primary,
                ),
                title: Text(c['name']?.toString() ?? 'Agenda'),
                onTap: () => Navigator.pop(ctx, calendarIdOf(c)),
              ),
          ],
        ),
      ),
    );
    if (choice == null) return;
    setState(() => _calendarId = choice);
  }

  Future<T?> _pickSheet<T>({
    required String title,
    required List<({T value, String label})> options,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(title, style: Theme.of(ctx).textTheme.titleMedium),
              ),
            ),
            for (final o in options)
              ListTile(
                title: Text(o.label),
                onTap: () => Navigator.pop(ctx, o.value),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _attachDrive() async {
    setState(() => _error = null);
    try {
      final probe = widget.driveProbe ?? widget.api.probeHuberaDrive;
      final result = await probe();
      if (!mounted) return;
      if (!result.reachable) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Pièce jointe'),
            content: const Text(kHuberaDriveMissingMessage),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Compris')),
            ],
          ),
        );
        return;
      }
      if (result.files.isEmpty) {
        setState(() => _error = 'Drive est joignable, mais aucun fichier à la racine.');
        return;
      }
      final picked = await showModalBottomSheet<DriveFileRef>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text('Hubera Drive', style: Theme.of(ctx).textTheme.titleMedium),
              ),
              for (final f in result.files)
                ListTile(
                  leading: const Icon(Icons.insert_drive_file_outlined),
                  title: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () => Navigator.pop(ctx, f),
                ),
            ],
          ),
        ),
      );
      if (picked == null) return;
      setState(() {
        _files = [
          for (final f in _files)
            if (f.id != picked.id) f,
          picked,
        ];
      });
    } catch (e) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Pièce jointe'),
          content: const Text(kHuberaDriveMissingMessage),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Compris')),
          ],
        ),
      );
    }
  }

  Future<void> _remind(int? id, DateTime start) async {
    if (id == null) return;
    final when = _reminder < 0
        ? null
        : nextCalendarReminderAt(
            start: start,
            minutesBefore: _reminder,
            repeatRule: _repeat,
            now: DateTime.now(),
          );
    await dispatchCalendarReminder(
      CalendarReminderPlan(
        eventId: id,
        title: _title.text.trim(),
        when: when,
        cancel: when == null,
      ),
    );
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Titre requis');
      return;
    }
    if (!_allDay && !_end.isAfter(_start)) {
      setState(() => _error = 'La fin doit être après le début');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      var s = _start;
      var e = _end;
      if (_allDay) {
        s = DateTime(s.year, s.month, s.day);
        e = DateTime(e.year, e.month, e.day);
        if (!e.isAfter(s)) e = s.add(const Duration(days: 1));
      }
      final emails = _guests.text
          .split(RegExp(r'[,;]'))
          .map((x) => x.trim())
          .where((x) => x.contains('@'))
          .toList();
      final files = [for (final f in _files) f.toJson()];
      final id = _eventId(widget.existing);
      var savedId = id;
      if (id == null) {
        final created = await widget.api.createCalendarEvent(
          title: title,
          startAt: _iso(s),
          endAt: _iso(e),
          location: _location.text.trim(),
          description: _description.text.trim(),
          allDay: _allDay,
          calendarId: _calendarId,
          repeatRule: _repeat.isEmpty ? null : _repeat,
          attendees: emails,
          reminderMinutes: _reminder,
          attachments: files,
        );
        savedId = _eventId(created);
      } else {
        await widget.api.updateCalendarEvent(
          id: id,
          title: title,
          startAt: _iso(s),
          endAt: _iso(e),
          location: _location.text.trim(),
          description: _description.text.trim(),
          allDay: _allDay,
          calendarId: _calendarId,
          repeatRule: _repeat,
          clearRepeatRule: _repeat.isEmpty,
          attendees: emails,
          reminderMinutes: _reminder,
          attachments: files,
        );
      }
      await _remind(savedId, s);
      try {
        await widget.api.tryInviteEmails(
          title: title,
          whenLabel: formatCloudityDateTimeLocal(_iso(s)),
          location: _location.text.trim(),
          emails: emails,
        );
      } catch (_) {}
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _delete() async {
    final id = _eventId(widget.existing);
    if (id == null) return;
    final label = _title.text.trim().isEmpty ? 'cet événement' : _title.text.trim();
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
    if (ok != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await dispatchCalendarReminder(
        CalendarReminderPlan(eventId: id, title: label, when: null, cancel: true),
      );
      await widget.api.deleteCalendarEvent(id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = _calendarColor(theme.colorScheme.primary);
    final editing = widget.existing != null;
    Widget whenRow(DateTime value, {required bool start}) {
      return Row(
        children: [
          const SizedBox(width: 40),
          Expanded(
            child: InkWell(
              onTap: _busy ? null : () => _pickDate(start: start),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Text(_dateLabel(value), style: theme.textTheme.titleMedium),
              ),
            ),
          ),
          if (!_allDay)
            InkWell(
              onTap: _busy ? null : () => _pickTime(start: start),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
                child: Text(_clock(value), style: theme.textTheme.titleMedium),
              ),
            ),
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Fermer',
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          icon: const Icon(Icons.close),
        ),
        title: const SizedBox.shrink(),
        actions: [
          if (editing)
            IconButton(
              tooltip: 'Supprimer',
              onPressed: _busy ? null : _delete,
              icon: const Icon(Icons.delete_outline),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
            child: FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Enregistrer'),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          TextField(
            key: const Key('calendar-event-title'),
            controller: _title,
            textCapitalization: TextCapitalization.sentences,
            style: theme.textTheme.headlineSmall,
            decoration: const InputDecoration(
              hintText: 'Ajouter un titre',
              border: InputBorder.none,
            ),
          ),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.circle, color: accent, size: 18),
            title: Text(_calendarLabel()),
            onTap: _busy ? null : _pickCalendar,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.schedule),
            title: const Text('Toute la journée'),
            value: _allDay,
            onChanged: _busy ? null : (v) => setState(() => _allDay = v),
          ),
          whenRow(_start, start: true),
          whenRow(_end, start: false),
          ListTile(
            key: const Key('calendar-event-repeat'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.repeat),
            title: Text(_repeat.isEmpty ? 'Une seule fois' : _repeatLabel()),
            onTap: _busy ? null : _pickRepeat,
          ),
          TextField(
            controller: _guests,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              icon: Icon(Icons.people_outline),
              hintText: 'Ajouter des contacts',
              border: InputBorder.none,
            ),
          ),
          Autocomplete<String>(
            optionsBuilder: (text) {
              final q = text.text.trim().toLowerCase();
              if (q.isEmpty) return const Iterable<String>.empty();
              final out = <String>[];
              for (final c in _contacts) {
                final name = (c['name'] ?? c['display_name'] ?? '').toString();
                final addr = formatContactAddress(firstContactAddress(c));
                if (addr.isEmpty) continue;
                if (name.toLowerCase().contains(q) || addr.toLowerCase().contains(q)) {
                  out.add(addr);
                }
              }
              return out.take(8);
            },
            onSelected: (opt) => _location.text = opt,
            fieldViewBuilder: (context, textCtrl, focus, onSubmit) {
              if (textCtrl.text.isEmpty && _location.text.isNotEmpty && textCtrl.text != _location.text) {
                textCtrl.text = _location.text;
              }
              return TextField(
                controller: textCtrl,
                focusNode: focus,
                decoration: const InputDecoration(
                  icon: Icon(Icons.place_outlined),
                  hintText: 'Ajouter un lieu',
                  border: InputBorder.none,
                ),
                onChanged: (v) => _location.text = v,
              );
            },
          ),
          ListTile(
            key: const Key('calendar-event-notify'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.notifications_outlined),
            title: Text(_reminder < 0 ? 'Ajouter une notification' : _reminderLabel()),
            onTap: _busy ? null : _pickReminder,
          ),
          TextField(
            controller: _description,
            minLines: 1,
            maxLines: 5,
            decoration: const InputDecoration(
              icon: Icon(Icons.notes_outlined),
              hintText: 'Ajouter une description',
              border: InputBorder.none,
            ),
          ),
          ListTile(
            key: const Key('calendar-event-drive'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.attach_file),
            title: Text(
              _files.isEmpty
                  ? 'Ajouter une pièce jointe'
                  : _files.map((f) => f.name).join(', '),
            ),
            onTap: _busy ? null : _attachDrive,
          ),
          if (_files.isNotEmpty)
            Wrap(
              spacing: 8,
              children: [
                for (final f in _files)
                  InputChip(
                    label: Text(f.name),
                    onDeleted: _busy
                        ? null
                        : () => setState(() {
                              _files = [for (final x in _files) if (x.id != f.id) x];
                            }),
                  ),
              ],
            ),
          if (_series)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'La modification s’applique à toute la série.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ),
        ],
      ),
    );
  }
}
