import 'dart:async';

import 'package:flutter/material.dart';

import 'network_errors.dart';

import 'calendar_repeat.dart';
import 'cloudity_datetime.dart';

/// Fond de carte et d’éditeur. Le défaut suit le thème du téléphone.
Color noteKeepColor(String? id, ColorScheme scheme) {
  final dark = scheme.brightness == Brightness.dark;
  return switch (id) {
    'yellow' => dark ? const Color(0xFF635D19) : const Color(0xFFFFF475),
    'green' => dark ? const Color(0xFF345920) : const Color(0xFFCCFF90),
    'blue' => dark ? const Color(0xFF2A4B5C) : const Color(0xFFCBF0F8),
    'pink' => dark ? const Color(0xFF5C2B43) : const Color(0xFFFDCFE8),
    'purple' => dark ? const Color(0xFF47325C) : const Color(0xFFD7AEFB),
    'orange' => dark ? const Color(0xFF614A19) : const Color(0xFFFBBC04),
    'teal' => dark ? const Color(0xFF1D4A44) : const Color(0xFFA7FFEB),
    'red' => dark ? const Color(0xFF5C2B28) : const Color(0xFFF28B82),
    'gray' => dark ? const Color(0xFF3C4043) : const Color(0xFFE8EAED),
    _ => scheme.surface,
  };
}

const Duration notesKeepSaveDelay = Duration(milliseconds: 500);

const notesEditorSurfaceKey = Key('notes-editor-surface');
const notesEditorTitleKey = Key('notes-editor-title');
const notesEditorBodyKey = Key('notes-editor-body');
const notesEditorBackKey = Key('notes-editor-back');
const notesEditorColorKey = Key('notes-editor-color');
const notesEditorListKey = Key('notes-editor-list');
const notesEditorLabelsKey = Key('notes-editor-labels');
const notesEditorCheckKey = Key('notes-editor-check');
const notesLabelFieldKey = Key('notes-label-field');
const notesLabelCreateKey = Key('notes-label-create');

/// Photo d’une note. Une case vide (sans texte) ne compte pas.
class NotesKeepSnapshot {
  const NotesKeepSnapshot({
    required this.title,
    required this.content,
    required this.color,
    required this.pinned,
    required this.archived,
    required this.labels,
    required this.checklist,
    this.remindAt,
    this.listMode = false,
  });

  final String title;
  final String content;
  final String color;
  final bool pinned;
  final bool archived;
  final List<String> labels;
  final List<({String text, bool done})> checklist;
  final DateTime? remindAt;
  final bool listMode;

  bool get hasSubstance {
    if (title.trim().isNotEmpty) return true;
    if (!listMode && content.trim().isNotEmpty) return true;
    for (final item in checklist) {
      if (item.text.trim().isNotEmpty) return true;
    }
    return false;
  }

  bool sameAs(NotesKeepSnapshot other) {
    if (title != other.title ||
        content != other.content ||
        color != other.color ||
        pinned != other.pinned ||
        archived != other.archived ||
        listMode != other.listMode ||
        remindAt != other.remindAt ||
        labels.length != other.labels.length ||
        checklist.length != other.checklist.length) {
      return false;
    }
    for (var i = 0; i < labels.length; i++) {
      if (labels[i] != other.labels[i]) return false;
    }
    for (var i = 0; i < checklist.length; i++) {
      if (checklist[i].text != other.checklist[i].text ||
          checklist[i].done != other.checklist[i].done) {
        return false;
      }
    }
    return true;
  }
}

class _NoteRow {
  _NoteRow({String text = '', this.done = false})
      : controller = TextEditingController(text: text),
        focus = FocusNode();

  final TextEditingController controller;
  final FocusNode focus;
  bool done;

  void dispose() {
    controller.dispose();
    focus.dispose();
  }
}

/// Écran note : le retour et la frappe enregistrent. Une note vide ne reste pas.
class NotesKeepEditorScreen extends StatefulWidget {
  const NotesKeepEditorScreen({
    super.key,
    required this.persist,
    required this.remove,
    this.existing,
    this.startAsChecklist = false,
    this.seedRemind,
    this.labelCatalog = const [],
    this.initialLabels = const [],
    this.onLabelCreated,
    this.parkOffline,
  });

  final Future<int?> Function(NotesKeepSnapshot snap, int? id) persist;
  final Future<void> Function(int id) remove;
  final Map<String, dynamic>? existing;
  final bool startAsChecklist;
  final DateTime? seedRemind;
  final List<String> labelCatalog;
  final List<String> initialLabels;
  final void Function(String label)? onLabelCreated;

  /// Garde la note sur l’appareil si le réseau manque. Renvoie le jeton local.
  final Future<String?> Function(NotesKeepSnapshot snap, String? token)? parkOffline;

  @override
  State<NotesKeepEditorScreen> createState() => _NotesKeepEditorScreenState();
}

class _NotesKeepEditorScreenState extends State<NotesKeepEditorScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _bodyFocus = FocusNode();
  final _rows = <_NoteRow>[];

  var _color = 'default';
  var _pinned = false;
  var _archived = false;
  var _listMode = false;
  var _allowPop = false;
  var _leaving = false;
  var _discard = false;
  var _changed = false;
  String? _error;
  DateTime? _remindAt;
  List<String> _labels = const [];
  int? _id;
  String? _offlineToken;
  NotesKeepSnapshot? _saved;
  Timer? _timer;
  Future<void> _chain = Future<void>.value();

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _title.text = existing?['title']?.toString() ?? '';
    _body.text = (existing?['content'] ?? existing?['body'])?.toString() ?? '';
    _title.selection = TextSelection.collapsed(offset: _title.text.length);
    _body.selection = TextSelection.collapsed(offset: _body.text.length);
    final rawColor = existing?['color']?.toString() ?? 'default';
    _color = rawColor.isEmpty ? 'default' : rawColor;
    _pinned = existing?['pinned'] == true;
    _archived = existing?['archived'] == true;
    _remindAt = parseCloudityDateTime(existing?['remind_at']?.toString()) ??
        (existing == null ? widget.seedRemind : null);
    _labels = [...widget.initialLabels];
    _id = _readId(existing);
    final extras = existing?['extras'];
    if (extras is Map && extras['checklist'] is List) {
      for (final raw in extras['checklist'] as List) {
        if (raw is! Map) continue;
        final text = raw['text']?.toString() ?? '';
        final done = raw['done'] == true;
        if (text.trim().isEmpty && !done) continue;
        _rows.add(_NoteRow(text: text, done: done));
      }
    }
    _listMode = widget.startAsChecklist || _rows.isNotEmpty;
    if (_listMode && _rows.isEmpty) {
      for (final line in _body.text.split('\n')) {
        if (line.trim().isEmpty) continue;
        _rows.add(_NoteRow(text: line));
      }
      if (_rows.isEmpty) _rows.add(_NoteRow());
      _body.clear();
    }
    _saved = _read();
  }

  int? _readId(Map<String, dynamic>? item) {
    if (item == null) return null;
    final id = item['id'];
    if (id is int) return id;
    return int.tryParse(id?.toString() ?? '');
  }

  NotesKeepSnapshot _read() {
    return NotesKeepSnapshot(
      title: _title.text,
      content: _listMode ? '' : _body.text,
      color: _color,
      pinned: _pinned,
      archived: _archived,
      labels: List<String>.from(_labels),
      checklist: [
        for (final row in _rows)
          if (_listMode && (row.controller.text.trim().isNotEmpty || row.done))
            (text: row.controller.text, done: row.done),
      ],
      remindAt: _remindAt,
      listMode: _listMode,
    );
  }

  void _onTyped() {
    _timer?.cancel();
    _timer = Timer(notesKeepSaveDelay, _kick);
  }

  void _touchNow() {
    _timer?.cancel();
    _kick();
  }

  void _kick() {
    if (_discard) return;
    _chain = _chain.then((_) => _flush());
  }

  Future<void> _flush() async {
    if (_discard || !mounted) return;
    final snap = _read();
    if (_saved != null && snap.sameAs(_saved!)) return;
    if (!snap.hasSubstance) {
      final id = _id;
      if (id != null) {
        await widget.remove(id);
        if (!mounted || _discard) return;
        _id = null;
        _changed = true;
      }
      _saved = snap;
      if (_error != null) setState(() => _error = null);
      return;
    }
    int? id;
    try {
      id = await widget.persist(snap, _id);
    } catch (e) {
      final park = widget.parkOffline;
      if (park == null || _id != null || !isRealNetworkFailure(e)) rethrow;
      final token = await park(snap, _offlineToken);
      if (!mounted || _discard) return;
      if (token == null || token.isEmpty) rethrow;
      _offlineToken = token;
      _saved = snap;
      _changed = true;
      if (_error != null) setState(() => _error = null);
      return;
    }
    if (!mounted || _discard) return;
    if (id == null) throw StateError('note sans id');
    _id = id;
    _offlineToken = null;
    _saved = snap;
    _changed = true;
    if (_error != null) setState(() => _error = null);
    if (!_read().sameAs(snap)) await _flush();
  }

  Future<void> _requestLeave() async {
    if (_leaving || _discard) return;
    _leaving = true;
    _timer?.cancel();
    _kick();
    try {
      await _chain;
      var guard = 0;
      while (mounted &&
          guard < 4 &&
          _saved != null &&
          !_read().sameAs(_saved!) &&
          _error == null) {
        guard += 1;
        _kick();
        await _chain;
      }
    } catch (_) {
      _leaving = false;
      if (mounted) setState(() => _error = 'Enregistrement impossible');
      return;
    }
    if (!mounted) return;
    if (_error != null && _read().hasSubstance) {
      _leaving = false;
      return;
    }
    setState(() => _allowPop = true);
    await Future<void>.delayed(Duration.zero);
    if (mounted) Navigator.of(context).pop(_changed);
  }

  Future<void> _delete() async {
    _discard = true;
    _timer?.cancel();
    try {
      await _chain;
      final id = _id;
      if (id != null) {
        await widget.remove(id);
        _changed = true;
      }
    } catch (_) {
      _discard = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Suppression impossible')),
        );
      }
      return;
    }
    if (!mounted) return;
    setState(() => _allowPop = true);
    await Future<void>.delayed(Duration.zero);
    if (mounted) Navigator.of(context).pop(_changed);
  }

  void _setListMode(bool enabled) {
    if (enabled == _listMode) return;
    setState(() {
      if (enabled) {
        if (_rows.isEmpty) {
          for (final line in _body.text.split('\n')) {
            if (line.trim().isEmpty) continue;
            _rows.add(_NoteRow(text: line));
          }
          if (_rows.isEmpty) _rows.add(_NoteRow());
        }
        _body.clear();
        _listMode = true;
      } else {
        final lines = [
          for (final row in _rows)
            if (row.controller.text.trim().isNotEmpty) row.controller.text.trim(),
        ];
        final removed = [..._rows];
        _rows.clear();
        _body.text = lines.join('\n');
        _body.selection = TextSelection.collapsed(offset: _body.text.length);
        _listMode = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          for (final row in removed) {
            row.dispose();
          }
        });
      }
    });
    if (enabled && _rows.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _rows.last.focus.requestFocus();
      });
    } else if (!enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _bodyFocus.requestFocus();
      });
    }
    _touchNow();
  }

  void _addRow({int? after, bool fromSubmit = false}) {
    final row = _NoteRow();
    setState(() {
      if (after == null || after >= _rows.length - 1) {
        _rows.add(row);
      } else {
        _rows.insert(after + 1, row);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) row.focus.requestFocus();
    });
    if (!fromSubmit) _touchNow();
  }

  Future<void> _pickColor() async {
    final scheme = Theme.of(context).colorScheme;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            return Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.paddingOf(ctx).bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Couleur', style: Theme.of(ctx).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final option in kNoteColorOptions)
                        Tooltip(
                          message: option.label,
                          child: InkWell(
                            key: ValueKey('note-color-${option.id}'),
                            customBorder: const CircleBorder(),
                            onTap: () {
                              setState(() => _color = option.id);
                              setSheet(() {});
                              _touchNow();
                            },
                            child: Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: noteKeepColor(option.id, scheme),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: _color == option.id
                                      ? scheme.onSurface
                                      : scheme.outlineVariant,
                                  width: _color == option.id ? 2.5 : 1,
                                ),
                              ),
                              child: _color == option.id
                                  ? Icon(Icons.check, size: 18, color: scheme.onSurface)
                                  : null,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _openLabels() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => NotesLabelPage(
          catalog: widget.labelCatalog,
          selected: _labels,
          onChanged: (labels) {
            setState(() => _labels = labels);
            _touchNow();
          },
          onCreated: (name) => widget.onLabelCreated?.call(name),
        ),
      ),
    );
  }

  Future<void> _pickRemind() async {
    final initial = _remindAt ?? DateTime.now().add(const Duration(hours: 1));
    final day = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2040),
    );
    if (day == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    setState(() {
      _remindAt = DateTime(day.year, day.month, day.day, time.hour, time.minute);
    });
    _touchNow();
  }

  String _remindLabel(DateTime value) {
    final local = value.toLocal();
    final d = local.day.toString().padLeft(2, '0');
    final m = local.month.toString().padLeft(2, '0');
    final h = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');
    return '$d/$m/${local.year} $h:$min';
  }

  @override
  void dispose() {
    _timer?.cancel();
    _title.dispose();
    _body.dispose();
    _bodyFocus.dispose();
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final bg = noteKeepColor(_color, scheme);
    final titleStyle = theme.textTheme.titleLarge?.copyWith(
      color: scheme.onSurface,
      fontWeight: FontWeight.w600,
    );
    final bodyStyle = theme.textTheme.bodyLarge?.copyWith(
      color: scheme.onSurface,
      height: 1.35,
    );
    return PopScope(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _requestLeave();
      },
      child: Scaffold(
        key: notesEditorSurfaceKey,
        backgroundColor: bg,
        resizeToAvoidBottomInset: false,
        appBar: AppBar(
          backgroundColor: bg,
          surfaceTintColor: Colors.transparent,
          foregroundColor: scheme.onSurface,
          leading: IconButton(
            key: notesEditorBackKey,
            tooltip: 'Retour',
            onPressed: _requestLeave,
            icon: const Icon(Icons.arrow_back),
          ),
          actions: [
            IconButton(
              tooltip: _pinned ? 'Désépingler' : 'Épingler',
              onPressed: () {
                setState(() => _pinned = !_pinned);
                _touchNow();
              },
              icon: Icon(_pinned ? Icons.push_pin : Icons.push_pin_outlined),
            ),
            IconButton(
              tooltip: _archived ? 'Désarchiver' : 'Archiver',
              onPressed: () {
                setState(() => _archived = !_archived);
                _touchNow();
              },
              icon: Icon(_archived ? Icons.unarchive_outlined : Icons.archive_outlined),
            ),
            PopupMenuButton<String>(
              tooltip: 'Actions',
              onSelected: (value) {
                switch (value) {
                  case 'remind':
                    _pickRemind();
                  case 'clear-remind':
                    setState(() => _remindAt = null);
                    _touchNow();
                  case 'delete':
                    _delete();
                }
              },
              itemBuilder: (ctx) => [
                const PopupMenuItem(value: 'remind', child: Text('Rappel')),
                if (_remindAt != null)
                  const PopupMenuItem(
                    value: 'clear-remind',
                    child: Text('Supprimer le rappel'),
                  ),
                const PopupMenuItem(value: 'delete', child: Text('Supprimer')),
              ],
            ),
          ],
        ),
        body: Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  children: [
                    TextField(
                      key: notesEditorTitleKey,
                      controller: _title,
                      style: titleStyle,
                      cursorColor: scheme.primary,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        hintText: 'Titre',
                        hintStyle: titleStyle?.copyWith(color: scheme.onSurfaceVariant),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                      onChanged: (_) => _onTyped(),
                      onSubmitted: (_) {
                        if (_listMode && _rows.isNotEmpty) {
                          _rows.first.focus.requestFocus();
                        } else {
                          _bodyFocus.requestFocus();
                        }
                      },
                    ),
                    if (!_listMode)
                      TextField(
                        key: notesEditorBodyKey,
                        controller: _body,
                        focusNode: _bodyFocus,
                        autofocus: true,
                        style: bodyStyle,
                        cursorColor: scheme.primary,
                        minLines: 6,
                        maxLines: null,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: 'Note',
                          hintStyle: bodyStyle?.copyWith(color: scheme.onSurfaceVariant),
                          border: InputBorder.none,
                        ),
                        onChanged: (_) => _onTyped(),
                      )
                    else
                      for (var i = 0; i < _rows.length; i++)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Checkbox(
                              value: _rows[i].done,
                              onChanged: (value) {
                                setState(() => _rows[i].done = value ?? false);
                                _touchNow();
                              },
                            ),
                            Expanded(
                              child: TextField(
                                key: i == 0 ? notesEditorCheckKey : ValueKey(_rows[i].focus),
                                controller: _rows[i].controller,
                                focusNode: _rows[i].focus,
                                autofocus: i == 0,
                                style: bodyStyle?.copyWith(
                                  decoration: _rows[i].done ? TextDecoration.lineThrough : null,
                                ),
                                cursorColor: scheme.primary,
                                textCapitalization: TextCapitalization.sentences,
                                textInputAction: TextInputAction.next,
                                decoration: InputDecoration(
                                  hintText: 'Élément de liste',
                                  hintStyle: bodyStyle?.copyWith(color: scheme.onSurfaceVariant),
                                  border: InputBorder.none,
                                  isDense: true,
                                ),
                                onChanged: (_) => _onTyped(),
                                onSubmitted: (_) => _addRow(after: i, fromSubmit: true),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Retirer',
                              onPressed: () {
                                final removed = _rows[i];
                                setState(() {
                                  _rows.removeAt(i);
                                  if (_rows.isEmpty) _rows.add(_NoteRow());
                                });
                                WidgetsBinding.instance.addPostFrameCallback((_) {
                                  removed.dispose();
                                });
                                _touchNow();
                              },
                              icon: const Icon(Icons.close),
                            ),
                          ],
                        ),
                    if (_listMode)
                      TextButton.icon(
                        onPressed: _addRow,
                        icon: const Icon(Icons.add),
                        label: const Text('Élément de liste'),
                      ),
                    if (_labels.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final label in _labels)
                            ActionChip(
                              avatar: Icon(Icons.label_outline, size: 16, color: scheme.onSurface),
                              label: Text(label),
                              onPressed: _openLabels,
                            ),
                        ],
                      ),
                    ],
                    if (_remindAt != null) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: ActionChip(
                          avatar: Icon(Icons.alarm, size: 16, color: scheme.onSurface),
                          label: Text(_remindLabel(_remindAt!)),
                          onPressed: _pickRemind,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    _error!,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
                  ),
                ),
              Material(
                color: bg,
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: MediaQuery.viewInsetsOf(context).bottom > 0
                        ? 0
                        : MediaQuery.paddingOf(context).bottom,
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        key: notesEditorListKey,
                        tooltip: _listMode ? 'Masquer les cases à cocher' : 'Cases à cocher',
                        onPressed: () => _setListMode(!_listMode),
                        icon: Icon(
                          _listMode ? Icons.check_box : Icons.check_box_outlined,
                        ),
                      ),
                      IconButton(
                        key: notesEditorColorKey,
                        tooltip: 'Couleur',
                        onPressed: _pickColor,
                        icon: const Icon(Icons.palette_outlined),
                      ),
                      IconButton(
                        key: notesEditorLabelsKey,
                        tooltip: 'Libellés',
                        onPressed: _openLabels,
                        icon: const Icon(Icons.label_outline),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class NotesLabelPage extends StatefulWidget {
  const NotesLabelPage({
    super.key,
    required this.catalog,
    required this.selected,
    required this.onChanged,
    this.onCreated,
  });

  final List<String> catalog;
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;
  final ValueChanged<String>? onCreated;

  @override
  State<NotesLabelPage> createState() => _NotesLabelPageState();
}

class _NotesLabelPageState extends State<NotesLabelPage> {
  final _query = TextEditingController();
  late List<String> _catalog;
  late List<String> _selected;

  @override
  void initState() {
    super.initState();
    _catalog = [...widget.catalog];
    _selected = [...widget.selected];
    _query.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  bool _same(String a, String b) => a.toLowerCase() == b.toLowerCase();

  void _toggle(String label, bool on) {
    setState(() {
      if (on) {
        if (!_selected.any((item) => _same(item, label))) {
          _selected = [..._selected, label];
        }
      } else {
        _selected = [
          for (final item in _selected)
            if (!_same(item, label)) item,
        ];
      }
    });
    widget.onChanged(List<String>.from(_selected));
  }

  void _create(String raw) {
    final name = raw.trim();
    if (name.isEmpty) return;
    final clipped = name.length > 64 ? name.substring(0, 64) : name;
    final known = _catalog.cast<String?>().firstWhere(
          (item) => item != null && _same(item, clipped),
          orElse: () => null,
        );
    final label = known ?? clipped;
    setState(() {
      if (known == null) _catalog = [..._catalog, label];
      if (!_selected.any((item) => _same(item, label))) {
        _selected = [..._selected, label];
      }
      _query.clear();
    });
    if (known == null) widget.onCreated?.call(label);
    widget.onChanged(List<String>.from(_selected));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final q = _query.text.trim();
    final visible = _catalog.where((label) {
      if (q.isEmpty) return true;
      return label.toLowerCase().contains(q.toLowerCase());
    }).toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    final exact = q.isNotEmpty && _catalog.any((label) => _same(label, q));
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          key: notesLabelFieldKey,
          controller: _query,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            hintText: 'Saisissez le nom du libellé',
            border: InputBorder.none,
          ),
          onSubmitted: _create,
        ),
      ),
      body: ListView(
        children: [
          if (q.isNotEmpty && !exact)
            ListTile(
              key: notesLabelCreateKey,
              leading: Icon(Icons.add, color: scheme.primary),
              title: Text('Créer le libellé « $q »'),
              onTap: () => _create(q),
            ),
          for (final label in visible)
            CheckboxListTile(
              value: _selected.any((item) => _same(item, label)),
              secondary: const Icon(Icons.label_outline),
              title: Text(label),
              controlAffinity: ListTileControlAffinity.trailing,
              onChanged: (value) => _toggle(label, value ?? false),
            ),
        ],
      ),
    );
  }
}
