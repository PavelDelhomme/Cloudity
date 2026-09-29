import 'package:flutter/material.dart';

import 'calendar_repeat.dart';
import 'cloudity_crash_reporter.dart';
import 'cloudity_datetime.dart';
import 'cloudity_error_ui.dart';
import 'suite_app_catalog.dart';
import 'suite_bottom_sheet.dart';
import 'suite_drawer_scaffold.dart';
import 'suite_feedback_screen.dart';
import 'suite_product_api.dart';
import 'suite_product_editor.dart';

/// Produit suite affiché par l'écran d'accueil mobile.
enum SuiteProduct { calendar, contacts, notes, tasks }

extension SuiteProductMeta on SuiteProduct {
  String get title => switch (this) {
        SuiteProduct.calendar => 'Agenda',
        SuiteProduct.contacts => 'Contacts',
        SuiteProduct.notes => 'Notes',
        SuiteProduct.tasks => 'Tâches',
      };

  String get webPath => switch (this) {
        SuiteProduct.calendar => '/app/calendar',
        SuiteProduct.contacts => '/app/contacts',
        SuiteProduct.notes => '/app/notes',
        SuiteProduct.tasks => '/app/tasks',
      };

  IconData get icon => switch (this) {
        SuiteProduct.calendar => Icons.calendar_month_outlined,
        SuiteProduct.contacts => Icons.contacts_outlined,
        SuiteProduct.notes => Icons.sticky_note_2_outlined,
        SuiteProduct.tasks => Icons.check_circle_outline,
      };

  ClouditySuiteApp get suiteApp => switch (this) {
        SuiteProduct.calendar => ClouditySuiteApp.calendar,
        SuiteProduct.contacts => ClouditySuiteApp.contacts,
        SuiteProduct.notes => ClouditySuiteApp.notes,
        SuiteProduct.tasks => ClouditySuiteApp.tasks,
      };
}

/// Écran principal MVP : liste API + drawer paramètres (aligné Mail/Photos).
class SuiteProductHomeScreen extends StatefulWidget {
  const SuiteProductHomeScreen({
    super.key,
    required this.product,
    required this.gatewayBase,
    required this.accessToken,
    required this.refreshAccessToken,
    required this.onLogout,
    this.userEmail,
  });

  final SuiteProduct product;
  final String gatewayBase;
  final String accessToken;
  final Future<String?> Function() refreshAccessToken;
  final Future<void> Function() onLogout;
  final String? userEmail;

  @override
  State<SuiteProductHomeScreen> createState() => _SuiteProductHomeScreenState();
}

class _SuiteProductHomeScreenState extends State<SuiteProductHomeScreen> {
  bool _loading = true;
  bool _showSettings = false;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _taskLists = [];
  int? _selectedTaskListId;
  String _contactQuery = '';
  bool _notesShowArchived = false;
  late SuiteProductApi _api;
  late DateTime _calFocusDay;
  bool _calDayFilter = false;
  final ScrollController _agendaScroll = ScrollController();
  final Map<String, GlobalKey> _agendaDayKeys = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _calFocusDay = DateTime(now.year, now.month, now.day);
    _api = SuiteProductApi(
      gatewayBase: widget.gatewayBase,
      accessToken: widget.accessToken,
      onTokenRefresh: widget.refreshAccessToken,
    );
    _reload();
  }

  @override
  void dispose() {
    _agendaScroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _fetchItems();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      CloudityCrashReporter.trackNetworkError(e);
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<List<Map<String, dynamic>>> _fetchItems() async {
    switch (widget.product) {
      case SuiteProduct.calendar:
        final events = await _api.fetchCalendarEvents();
        if (events.isNotEmpty) {
          events.sort((a, b) {
            final da = parseCloudityDateTime(
                  (a['start_at'] ?? a['starts_at'])?.toString(),
                ) ??
                DateTime.fromMillisecondsSinceEpoch(0);
            final db = parseCloudityDateTime(
                  (b['start_at'] ?? b['starts_at'])?.toString(),
                ) ??
                DateTime.fromMillisecondsSinceEpoch(0);
            return da.compareTo(db);
          });
          return events;
        }
        return await _api.fetchCalendars();
      case SuiteProduct.contacts:
        return _api.fetchContacts();
      case SuiteProduct.notes:
        return _api.fetchNotes();
      case SuiteProduct.tasks:
        _taskLists = await _api.fetchTaskLists();
        return _api.fetchTasks(listId: _selectedTaskListId);
    }
  }

  String _itemTitle(Map<String, dynamic> item) {
    switch (widget.product) {
      case SuiteProduct.calendar:
        final title = item['title']?.toString() ??
            item['name']?.toString() ??
            item['summary']?.toString() ??
            '(sans titre)';
        final rr = normalizeCalendarRepeat(item['repeat_rule']?.toString());
        return rr == null ? title : '↻ $title';
      case SuiteProduct.contacts:
        final name = item['display_name']?.toString().trim();
        if (name != null && name.isNotEmpty) return name;
        final n = item['name']?.toString().trim();
        if (n != null && n.isNotEmpty) return n;
        final fn = item['first_name']?.toString() ?? '';
        final ln = item['last_name']?.toString() ?? '';
        final full = '$fn $ln'.trim();
        return full.isNotEmpty ? full : item['email']?.toString() ?? '(contact)';
      case SuiteProduct.notes:
        final t = item['title']?.toString() ?? '(sans titre)';
        return item['pinned'] == true ? '📌 $t' : t;
      case SuiteProduct.tasks:
        final t = item['title']?.toString() ?? '(tâche)';
        return item['starred'] == true ? '★ $t' : t;
    }
  }

  String? _itemSubtitle(Map<String, dynamic> item) {
    switch (widget.product) {
      case SuiteProduct.calendar:
        final start = item['start_at'] ?? item['starts_at'];
        final rr = normalizeCalendarRepeat(item['repeat_rule']?.toString());
        final when = formatCloudityDateTimeLocal(start?.toString());
        if (rr == null) return when;
        final label = kCalendarRepeatOptions
            .where((o) => o.value == rr)
            .map((o) => o.label)
            .followedBy(const ['']).first;
        return '$when · ${label.isEmpty ? rr : label}';
      case SuiteProduct.contacts:
        final profile = item['profile'];
        String? org;
        final extraMails = <String>[];
        if (profile is Map) {
          org = profile['organization']?.toString();
          if (org != null && org.trim().isEmpty) org = null;
          final emails = profile['emails'];
          if (emails is List) {
            final primary = (item['email']?.toString() ?? '').trim().toLowerCase();
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
              extraMails.add(t);
            }
          }
        }
        final email = item['email']?.toString();
        final phone = item['phone']?.toString();
        final bits = <String>[
          if (org != null) org,
          if (email != null && email.isNotEmpty && email != 'locked@vault.local')
            email,
          ...extraMails,
          if (phone != null && phone.isNotEmpty) phone,
        ];
        return bits.isEmpty ? null : bits.join(' · ');
      case SuiteProduct.notes:
        final body =
            item['body']?.toString() ?? item['content']?.toString() ?? '';
        final remind = item['remind_at']?.toString();
        final color = item['color']?.toString();
        final bits = <String>[
          if (color != null && color != 'default') color,
          if (remind != null && remind.isNotEmpty)
            'Rappel ${formatCloudityDateTimeLocal(remind)}',
          if (body.isNotEmpty)
            body.length > 60 ? '${body.substring(0, 60)}…' : body,
        ];
        return bits.isEmpty ? null : bits.join(' · ');
      case SuiteProduct.tasks:
        final bits = <String>[];
        final due = item['due_at'] ?? item['due_date'];
        if (due != null) {
          bits.add('Échéance ${formatCloudityDateTimeLocal(due.toString())}');
        }
        final rr = normalizeCalendarRepeat(item['repeat_rule']?.toString());
        if (rr != null) {
          final label = kCalendarRepeatOptions
              .where((o) => o.value == rr)
              .map((o) => o.label)
              .followedBy([rr])
              .first;
          bits.add(label);
        }
        final listName = item['list_name']?.toString();
        if (listName != null && listName.isNotEmpty) bits.add(listName);
        return bits.isEmpty ? null : bits.join(' · ');
    }
  }

  Future<void> _openEditor({Map<String, dynamic>? existing}) async {
    final saved = await showSuiteProductEditor(
      context: context,
      product: widget.product,
      api: _api,
      existing: existing,
      taskListId: _selectedTaskListId,
    );
    if (saved && mounted) await _reload();
  }

  Future<void> _deleteItem(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    if (!await confirmSuiteDelete(context, _itemTitle(item))) return;
    try {
      switch (widget.product) {
        case SuiteProduct.calendar:
          await _api.deleteCalendarEvent(id);
        case SuiteProduct.contacts:
          await _api.deleteContact(id);
        case SuiteProduct.notes:
          await _api.deleteNote(id);
        case SuiteProduct.tasks:
          await _api.deleteTask(id);
      }
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _toggleNotePin(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    try {
      await _api.updateNote(id: id, pinned: item['pinned'] != true);
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _toggleTask(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    final done = item['completed'] == true;
    try {
      await _api.updateTask(id: id, completed: !done);
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  List<Widget> _productNavItems() {
    return [
      ListTile(
        leading: Icon(widget.product.icon),
        title: Text(widget.product.title),
        selected: !_showSettings,
        onTap: () {
          Navigator.pop(context);
          setState(() => _showSettings = false);
        },
      ),
      if (widget.product == SuiteProduct.notes)
        SwitchListTile(
          title: const Text('Archives'),
          secondary: const Icon(Icons.archive_outlined),
          value: _notesShowArchived,
          onChanged: (v) {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _notesShowArchived = v;
            });
          },
        ),
      if (widget.product == SuiteProduct.tasks) ...[
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text('Listes'),
        ),
        ListTile(
          title: const Text('Toutes les tâches'),
          selected: _selectedTaskListId == null,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _selectedTaskListId = null;
            });
            _reload();
          },
        ),
        ..._taskLists.map((list) {
          final id = list['id'];
          final listId = id is int ? id : int.tryParse(id?.toString() ?? '');
          final name = list['name']?.toString() ?? 'Liste';
          final selected = _selectedTaskListId == listId;
          return ListTile(
            title: Text(name),
            selected: selected,
            onTap: () {
              Navigator.pop(context);
              setState(() {
                _showSettings = false;
                _selectedTaskListId = listId;
              });
              _reload();
            },
          );
        }),
      ],
    ];
  }

  String _emptyTitle() => switch (widget.product) {
        SuiteProduct.calendar => 'Aucun événement',
        SuiteProduct.notes => 'Aucune note',
        SuiteProduct.tasks => 'Aucune tâche',
        SuiteProduct.contacts => 'Aucun contact',
      };

  String _emptySubtitle() => switch (widget.product) {
        SuiteProduct.calendar =>
          'Ajoute un rendez-vous — synchronisé avec le web Hubera Agenda.',
        SuiteProduct.notes =>
          'Écris une note — couleurs, épingles et listes, comme sur Notes web.',
        SuiteProduct.tasks =>
          'Crée une tâche — listes et échéances, comme Google Tasks.',
        SuiteProduct.contacts =>
          'Ajoute un contact — synchronisé avec Contacts web.',
      };

  String _dayKey(DateTime d) => '${d.year}-${d.month}-${d.day}';

  void _jumpToCalendarDay(DateTime day, {required bool filter}) {
    final focus = DateTime(day.year, day.month, day.day);
    setState(() {
      _calFocusDay = focus;
      _calDayFilter = filter;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = _agendaDayKeys[_dayKey(focus)]?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 280),
          alignment: 0.05,
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  Widget _buildWeekStrip(DateTime today, Color accent) {
    final theme = Theme.of(context);
    final weekStart = today.subtract(Duration(days: today.weekday - 1));
    final days = List.generate(14, (i) => weekStart.add(Duration(days: i)));
    const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

    return Material(
      color: theme.colorScheme.surface,
      elevation: 0.5,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 72,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              itemCount: days.length,
              itemBuilder: (context, i) {
                final d = days[i];
                final isToday = d == today;
                final selected = d == _calFocusDay && _calDayFilter;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => _jumpToCalendarDay(d, filter: true),
                    child: SizedBox(
                      width: 44,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            labels[d.weekday - 1],
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            width: 34,
                            height: 34,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: selected
                                  ? accent
                                  : (isToday
                                      ? accent.withValues(alpha: 0.15)
                                      : Colors.transparent),
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${d.day}',
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: selected
                                    ? theme.colorScheme.onPrimary
                                    : (isToday
                                        ? accent
                                        : theme.colorScheme.onSurface),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          if (_calDayFilter)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      formatCloudityDayHeaderFromDate(_calFocusDay),
                      style: theme.textTheme.labelLarge,
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _calDayFilter = false),
                    child: const Text('Toute l’agenda'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleItems {
    var items = _items;
    if (widget.product == SuiteProduct.notes) {
      items = items.where((n) {
        final archived = n['archived'] == true;
        return _notesShowArchived ? archived : !archived;
      }).toList();
      items.sort((a, b) {
        final pa = a['pinned'] == true ? 0 : 1;
        final pb = b['pinned'] == true ? 0 : 1;
        return pa.compareTo(pb);
      });
    }
    final q = _contactQuery.trim().toLowerCase();
    if (q.isEmpty) return items;
    if (widget.product != SuiteProduct.contacts &&
        widget.product != SuiteProduct.notes &&
        widget.product != SuiteProduct.tasks) {
      return items;
    }
    return items.where((item) {
      final hay = [
        _itemTitle(item),
        _itemSubtitle(item) ?? '',
        item['email']?.toString() ?? '',
        item['phone']?.toString() ?? '',
        item['body']?.toString() ?? '',
        item['content']?.toString() ?? '',
      ].join(' ').toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  Widget _buildListBody() {
    return RefreshIndicator(
      onRefresh: _reload,
      child: _loading
          ? ListView(
              children: const [
                SizedBox(height: 120),
                Center(child: CircularProgressIndicator()),
              ],
            )
                  : _error != null
                      ? CloudityErrorBody(
                          message: _error!,
                          onRetry: _reload,
                          onReport: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => SuiteFeedbackScreen(
                                  screenName: widget.product.title,
                                ),
                              ),
                            );
                          },
                        )
                  : _items.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 80),
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              children: [
                                Icon(
                                  widget.product.icon,
                                  size: 48,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .primary
                                      .withValues(alpha: 0.55),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  _emptyTitle(),
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.titleMedium,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _emptySubtitle(),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 16),
                                FilledButton.icon(
                                  onPressed: _showCreateMenu,
                                  icon: const Icon(Icons.add),
                                  label: Text('Créer — ${widget.product.title}'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    )
                  : widget.product == SuiteProduct.notes
                      ? _buildNotesKeepBody()
                  : widget.product == SuiteProduct.calendar
                      ? _buildCalendarList()
                      : ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: _visibleItems.length +
                          (widget.product == SuiteProduct.contacts ||
                                  widget.product == SuiteProduct.tasks
                              ? 1
                              : 0),
                      itemBuilder: (context, index) {
                        if (widget.product == SuiteProduct.contacts) {
                          if (index == 0) {
                            return Padding(
                              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                              child: TextField(
                                decoration: const InputDecoration(
                                  prefixIcon: Icon(Icons.search),
                                  hintText: 'Rechercher un contact',
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                                onChanged: (v) =>
                                    setState(() => _contactQuery = v),
                              ),
                            );
                          }
                          index -= 1;
                        }
                        if (widget.product == SuiteProduct.tasks) {
                          if (index == 0) {
                            return _buildTasksHeader();
                          }
                          index -= 1;
                        }
                        final theme = Theme.of(context);
                        final item = _visibleItems[index];
                        final sub = _itemSubtitle(item);
                        final done = item['completed'] == true;
                        return Card(
                          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                            side: BorderSide(
                              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.55),
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            leading: widget.product == SuiteProduct.tasks
                                ? IconButton(
                                    icon: Icon(
                                      done
                                          ? Icons.check_circle
                                          : Icons.radio_button_unchecked,
                                      color: done
                                          ? theme.colorScheme.primary
                                          : theme.colorScheme.onSurfaceVariant,
                                    ),
                                    onPressed: () => _toggleTask(item),
                                  )
                                : null,
                            title: Text(
                              _itemTitle(item),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: done
                                  ? TextStyle(
                                      decoration: TextDecoration.lineThrough,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    )
                                  : const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: sub != null
                                ? Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis)
                                : null,
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _deleteItem(item),
                            ),
                            onTap: () => _openEditor(existing: item),
                          ),
                        );
                      },
                    ),
    );
  }

  Widget _buildTasksHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Rechercher une tâche',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _contactQuery = v),
          ),
          if (_taskLists.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                FilterChip(
                  label: const Text('Toutes'),
                  selected: _selectedTaskListId == null,
                  onSelected: (_) {
                    setState(() => _selectedTaskListId = null);
                    _reload();
                  },
                ),
                ..._taskLists.map((list) {
                  final id = list['id'];
                  final listId =
                      id is int ? id : int.tryParse(id?.toString() ?? '');
                  final name = list['name']?.toString() ?? 'Liste';
                  return FilterChip(
                    label: Text(name),
                    selected: _selectedTaskListId == listId,
                    onSelected: (_) {
                      setState(() => _selectedTaskListId = listId);
                      _reload();
                    },
                  );
                }),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _keepNoteColor(String? id, Brightness brightness) {
    final dark = brightness == Brightness.dark;
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
      _ => dark ? const Color(0xFF2D2E30) : const Color(0xFFFFFFFF),
    };
  }

  Widget _keepNoteCard(Map<String, dynamic> item) {
    final theme = Theme.of(context);
    final pinned = item['pinned'] == true;
    final colorId = item['color']?.toString();
    final bg = _keepNoteColor(colorId, theme.brightness);
    final title = item['title']?.toString() ?? '';
    final body =
        item['body']?.toString() ?? item['content']?.toString() ?? '';
    final remind = item['remind_at']?.toString();
    final labels = item['labels'];
    final labelBits = <String>[];
    if (labels is List) {
      for (final l in labels) {
        if (l is String && l.trim().isNotEmpty) labelBits.add(l.trim());
        if (l is Map) {
          final n = (l['name'] ?? l['label'] ?? l['title'])?.toString();
          if (n != null && n.trim().isNotEmpty) labelBits.add(n.trim());
        }
      }
    }
    return Card(
      color: bg,
      elevation: pinned ? 1.5 : 0.6,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.45),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openEditor(existing: item),
        onLongPress: () => _deleteItem(item),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      title.isEmpty ? 'Note' : title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: pinned ? 'Désépingler' : 'Épingler',
                    icon: Icon(
                      pinned ? Icons.push_pin : Icons.push_pin_outlined,
                      size: 18,
                    ),
                    onPressed: () => _toggleNotePin(item),
                  ),
                ],
              ),
              if (body.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  body.trim(),
                  maxLines: 8,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall,
                ),
              ],
              if (remind != null && remind.isNotEmpty) ...[
                const SizedBox(height: 8),
                Chip(
                  visualDensity: VisualDensity.compact,
                  avatar: const Icon(Icons.alarm, size: 14),
                  label: Text(
                    formatCloudityDateTimeLocal(remind),
                    style: theme.textTheme.labelSmall,
                  ),
                ),
              ],
              if (labelBits.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [
                    for (final lab in labelBits.take(6))
                      Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text(lab, style: theme.textTheme.labelSmall),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _keepMasonry(List<Map<String, dynamic>> notes) {
    final left = <Widget>[];
    final right = <Widget>[];
    for (var i = 0; i < notes.length; i++) {
      final card = _keepNoteCard(notes[i]);
      (i.isEven ? left : right).add(card);
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Column(children: left)),
          const SizedBox(width: 8),
          Expanded(child: Column(children: right)),
        ],
      ),
    );
  }

  Widget _buildNotesKeepBody() {
    final theme = Theme.of(context);
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return CloudityErrorBody(
        message: _error!,
        onRetry: _reload,
        onReport: () {
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => SuiteFeedbackScreen(
                screenName: widget.product.title,
              ),
            ),
          );
        },
      );
    }
    final items = _visibleItems;
    final pinned = items.where((n) => n['pinned'] == true).toList();
    final others = items.where((n) => n['pinned'] != true).toList();
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 88),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Material(
              color: theme.colorScheme.surface,
              elevation: 1,
              borderRadius: BorderRadius.circular(28),
              child: InkWell(
                borderRadius: BorderRadius.circular(28),
                onTap: () => _openEditor(),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Prendre une note…',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Liste',
                        icon: const Icon(Icons.check_box_outlined),
                        onPressed: () => _openEditor(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: _notesShowArchived
                    ? 'Rechercher dans les archives'
                    : 'Rechercher dans les notes',
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _contactQuery = v),
            ),
          ),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
              child: Column(
                children: [
                  Icon(
                    _notesShowArchived
                        ? Icons.archive_outlined
                        : Icons.sticky_note_2_outlined,
                    size: 48,
                    color: theme.colorScheme.primary.withValues(alpha: 0.55),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _notesShowArchived ? 'Aucune archive' : _emptyTitle(),
                    style: theme.textTheme.titleMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _notesShowArchived
                        ? 'Les notes archivées apparaissent ici.'
                        : _emptySubtitle(),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else ...[
            if (pinned.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                child: Text(
                  'ÉPINGLÉES',
                  style: theme.textTheme.labelSmall?.copyWith(
                    letterSpacing: 0.8,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              _keepMasonry(pinned),
            ],
            if (others.isNotEmpty) ...[
              if (pinned.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
                  child: Text(
                    'AUTRES',
                    style: theme.textTheme.labelSmall?.copyWith(
                      letterSpacing: 0.8,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              _keepMasonry(others),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildCalendarList() {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    final rawEvents = _items.where((item) {
      if ((item['start_at'] ?? item['starts_at']) == null &&
          item['name'] != null &&
          item['title'] == null) {
        return false;
      }
      return item.containsKey('start_at') ||
          item.containsKey('starts_at') ||
          item.containsKey('title');
    }).toList();

    final rangeStart = today.subtract(const Duration(days: 7));
    final rangeEnd = today.add(const Duration(days: 120));
    final events = expandCalendarEvents(
      rawEvents,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
    );

    final filtered = !_calDayFilter
        ? events
        : events.where((item) {
            final start = (item['start_at'] ?? item['starts_at'])?.toString();
            final parsed = parseCloudityDateTime(start) ?? today;
            final day = DateTime(parsed.year, parsed.month, parsed.day);
            return day == _calFocusDay;
          }).toList();

    if (events.isEmpty) {
      return Column(
        children: [
          _buildWeekStrip(today, accent),
          Expanded(
            child: ListView(
              children: [
                const SizedBox(height: 80),
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        Icon(Icons.event_available_outlined,
                            size: 48, color: accent.withValues(alpha: 0.6)),
                        const SizedBox(height: 12),
                        Text(
                          'Aucun événement à venir',
                          style: theme.textTheme.titleMedium,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Ajoute un rendez-vous — il apparaît aussi sur le web Hubera Agenda.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _openEditor,
                          icon: const Icon(Icons.add),
                          label: const Text('Créer un événement'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    final entries =
        <({String header, DateTime day, List<Map<String, dynamic>> items})>[];
    String? currentHeader;
    DateTime? currentDay;
    final bucket = <Map<String, dynamic>>[];

    void flush() {
      final h = currentHeader;
      final d = currentDay;
      if (h == null || d == null || bucket.isEmpty) return;
      entries.add((header: h, day: d, items: List.from(bucket)));
      bucket.clear();
    }

    for (final item in filtered) {
      final start = (item['start_at'] ?? item['starts_at'])?.toString();
      final parsed = parseCloudityDateTime(start) ?? today;
      final day = DateTime(parsed.year, parsed.month, parsed.day);
      final header = formatCloudityDayHeaderFromDate(parsed);
      if (header != currentHeader) {
        flush();
        currentHeader = header;
        currentDay = day;
      }
      bucket.add(item);
    }
    flush();

    return Column(
      children: [
        _buildWeekStrip(today, accent),
        Expanded(
          child: filtered.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 48),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            Text(
                              'Rien ce jour-là',
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Choisis un autre jour ou crée un événement.',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                              onPressed: _openEditor,
                              icon: const Icon(Icons.add),
                              label: const Text('Créer un événement'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                )
              : CustomScrollView(
                  controller: _agendaScroll,
                  slivers: [
                    for (final group in entries) ...[
                      // Ancre pour scroll « Aujourd’hui » / bandeau jour.
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: 0,
                          key: _agendaDayKeys.putIfAbsent(
                            _dayKey(group.day),
                            GlobalKey.new,
                          ),
                        ),
                      ),
                      SliverPersistentHeader(
                        pinned: true,
                        delegate: _AgendaDayHeaderDelegate(
                          label: group.header,
                          dayNumber: group.day.day,
                          isToday: group.day == today,
                          isPast: group.day.isBefore(today),
                          accent: accent,
                        ),
                      ),
                      SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) {
                            final item = group.items[i];
                            final start = (item['start_at'] ?? item['starts_at'])
                                ?.toString();
                            final end =
                                (item['end_at'] ?? item['ends_at'])?.toString();
                            final allDay = cloudityIsAllDay(start, end);
                            final timeLabel = allDay
                                ? 'Toute la journée'
                                : (end != null && end.isNotEmpty
                                    ? '${formatCloudityTimeLocal(start)} – ${formatCloudityTimeLocal(end)}'
                                    : formatCloudityTimeLocal(start));
                            final location = item['location']?.toString();
                            final past = cloudityIsPastDay(start);
                            return Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => _openEditor(existing: item),
                                child: Opacity(
                                  opacity: past ? 0.55 : 1,
                                  child: Padding(
                                    padding:
                                        const EdgeInsets.fromLTRB(12, 4, 8, 4),
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        SizedBox(
                                          width: 72,
                                          child: Padding(
                                            padding:
                                                const EdgeInsets.only(top: 10),
                                            child: Text(
                                              allDay
                                                  ? 'Journée'
                                                  : formatCloudityTimeLocal(
                                                      start),
                                              style: theme
                                                  .textTheme.labelMedium
                                                  ?.copyWith(
                                                color: theme.colorScheme
                                                    .onSurfaceVariant,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ),
                                        ),
                                        Container(
                                          width: 4,
                                          height: 48,
                                          margin: const EdgeInsets.only(
                                              right: 12, top: 6),
                                          decoration: BoxDecoration(
                                            color: accent,
                                            borderRadius:
                                                BorderRadius.circular(2),
                                          ),
                                        ),
                                        Expanded(
                                          child: Card(
                                            margin: EdgeInsets.zero,
                                            elevation: 0,
                                            color: theme.colorScheme
                                                .surfaceContainerHighest
                                                .withValues(alpha: 0.45),
                                            child: ListTile(
                                              contentPadding:
                                                  const EdgeInsets.symmetric(
                                                horizontal: 12,
                                                vertical: 2,
                                              ),
                                              title: Text(
                                                _itemTitle(item),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontWeight:
                                                        FontWeight.w600),
                                              ),
                                              subtitle: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(timeLabel),
                                                  if (location != null &&
                                                      location
                                                          .trim()
                                                          .isNotEmpty)
                                                    Text(
                                                      location.trim(),
                                                      maxLines: 1,
                                                      overflow:
                                                          TextOverflow.ellipsis,
                                                    ),
                                                ],
                                              ),
                                              isThreeLine: location != null &&
                                                  location.trim().isNotEmpty,
                                              trailing: IconButton(
                                                icon: const Icon(
                                                    Icons.delete_outline),
                                                onPressed: () =>
                                                    _deleteItem(item),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                          childCount: group.items.length,
                        ),
                      ),
                    ],
                    SliverToBoxAdapter(
                      child: SizedBox(
                          height: 88 + MediaQuery.paddingOf(context).bottom),
                    ),
                  ],
                ),
        ),
      ],
    );
  }

  Future<void> _showCreateMenu() async {
    if (widget.product == SuiteProduct.contacts) {
      await _openEditor();
      return;
    }
    if (widget.product != SuiteProduct.calendar &&
        widget.product != SuiteProduct.notes &&
        widget.product != SuiteProduct.tasks) {
      await _openEditor();
      return;
    }
    final choice = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Créer', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (widget.product == SuiteProduct.calendar ||
                widget.product == SuiteProduct.notes)
              ListTile(
                leading: const Icon(Icons.event_outlined),
                title: const Text('Événement Agenda'),
                onTap: () => Navigator.pop(ctx, 'event'),
              ),
            if (widget.product == SuiteProduct.calendar ||
                widget.product == SuiteProduct.tasks ||
                widget.product == SuiteProduct.notes)
              ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: const Text('Tâche'),
                onTap: () => Navigator.pop(ctx, 'task'),
              ),
            if (widget.product == SuiteProduct.calendar ||
                widget.product == SuiteProduct.notes ||
                widget.product == SuiteProduct.tasks)
              ListTile(
                leading: const Icon(Icons.sticky_note_2_outlined),
                title: const Text('Note'),
                onTap: () => Navigator.pop(ctx, 'note'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    final product = switch (choice) {
      'event' => SuiteProduct.calendar,
      'task' => SuiteProduct.tasks,
      'note' => SuiteProduct.notes,
      _ => widget.product,
    };
    final saved = await showSuiteProductEditor(
      context: context,
      product: product,
      api: _api,
      taskListId: _selectedTaskListId,
    );
    if (saved && mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return SuiteDrawerScaffold(
      currentApp: widget.product.suiteApp,
      title: _showSettings ? 'Paramètres' : widget.product.title,
      gatewayUrl: widget.gatewayBase,
      userEmail: widget.userEmail,
      showSettings: _showSettings,
      navItems: _productNavItems(),
      appBarActions: [
        if (!_showSettings && widget.product == SuiteProduct.calendar)
          IconButton(
            tooltip: 'Aujourd’hui',
            icon: const Icon(Icons.today_outlined),
            onPressed: () => _jumpToCalendarDay(today, filter: false),
          ),
        if (!_showSettings)
          IconButton(icon: const Icon(Icons.refresh), onPressed: _reload),
      ],
      onOpenSettings: () => setState(() => _showSettings = true),
      onCloseSettings: () => setState(() => _showSettings = false),
      onLogout: widget.onLogout,
      settingsBody: SuiteSettingsPanel(
        gatewayUrl: widget.gatewayBase,
        appName: widget.product.title,
        webAppPath: widget.product.webPath,
        onLogout: () => widget.onLogout(),
      ),
      floatingActionButton: _showSettings
          ? null
          : FloatingActionButton(
              onPressed: _showCreateMenu,
              tooltip: 'Créer',
              child: const Icon(Icons.add),
            ),
      body: _buildListBody(),
    );
  }
}

class _AgendaDayHeaderDelegate extends SliverPersistentHeaderDelegate {
  _AgendaDayHeaderDelegate({
    required this.label,
    required this.dayNumber,
    required this.isToday,
    required this.isPast,
    required this.accent,
  });

  final String label;
  final int dayNumber;
  final bool isToday;
  final bool isPast;
  final Color accent;

  @override
  double get minExtent => 48;

  @override
  double get maxExtent => 48;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final theme = Theme.of(context);
    return Material(
      elevation: overlapsContent ? 1 : 0,
      color: theme.colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isToday ? accent : Colors.transparent,
                shape: BoxShape.circle,
              ),
              child: Text(
                '$dayNumber',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: isToday
                      ? theme.colorScheme.onPrimary
                      : (isPast
                          ? theme.colorScheme.onSurfaceVariant
                          : theme.colorScheme.onSurface),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: theme.textTheme.titleSmall?.copyWith(
                  color: isToday ? accent : theme.colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _AgendaDayHeaderDelegate oldDelegate) {
    return label != oldDelegate.label ||
        dayNumber != oldDelegate.dayNumber ||
        isToday != oldDelegate.isToday ||
        isPast != oldDelegate.isPast ||
        accent != oldDelegate.accent;
  }
}
