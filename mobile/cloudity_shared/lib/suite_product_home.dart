import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'calendar_reminder.dart';
import 'calendar_repeat.dart';
import 'calendar_time_grid.dart';
import 'calendar_visibility.dart';
import 'cloudity_crash_reporter.dart';
import 'contact_directory.dart';
import 'contact_editor.dart';
import 'contact_fiche.dart';
import 'contact_maps.dart';
import 'device_google_contacts.dart';
import 'cloudity_datetime.dart';
import 'cloudity_error_ui.dart';
import 'network_errors.dart';
import 'hubera_scaffold.dart';
import 'suite_app_catalog.dart';
import 'suite_bottom_sheet.dart';
import 'suite_drawer_scaffold.dart';
import 'suite_home_gestures.dart';
import 'suite_feedback_screen.dart';
import 'notes_keep.dart';
import 'ota_update.dart';
import 'suite_product_api.dart';
import 'suite_product_editor.dart';

/// Vues agenda : journée (ouverture), trois jours, semaine, mois, liste.
enum CalendarHomeView { month, week, three, day, agenda }

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
    this.initialItems = const [],
  });

  final SuiteProduct product;
  final String gatewayBase;
  final String accessToken;
  final Future<String?> Function() refreshAccessToken;
  final Future<void> Function() onLogout;
  final String? userEmail;

  /// Liste locale déjà décodée avant runApp. Le premier frame n'attend pas le réseau.
  final List<Map<String, dynamic>> initialItems;

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
  ContactDirectory _contactDirectory = ContactDirectory.professional;
  List<Map<String, dynamic>> _deviceGoogleContacts = [];
  bool _deviceContactsLoading = false;
  bool _devicePermissionDenied = false;
  ContactPlacement _placement = const ContactPlacement();
  bool _placementReady = false;
  bool _placementHadPrefs = false;
  ContactShelf _contactShelf = ContactShelf.active;
  String _contactsNav = 'contacts';
  final TextEditingController _contactSearchCtrl = TextEditingController();
  final Set<String> _selectedContactKeys = {};
  final Map<ContactShelf, ScrollController> _contactScroll = {
    for (final shelf in ContactShelf.values) shelf: ScrollController(),
  };
  BlockedNumbersView _blocked = const BlockedNumbersView(
    canRead: false,
    canWrite: false,
    reason: '',
    numbers: [],
  );
  bool _blockedLoading = false;
  bool _blockedLoaded = false;
  final TextEditingController _blockNumberField = TextEditingController();
  String? _noteLabelFilter;
  bool _notesSearchOpen = false;
  bool _notesRemindersOnly = false;
  bool _notesShowArchived = false;
  bool _notesShowTrash = false;
  List<String> _customLabels = [];
  final Map<String, String> _trashAt = {};
  bool _notesPrefsLoaded = false;
  late SuiteProductApi _api;
  String _installedVersion = '';
  final TextEditingController _taskAddCtrl = TextEditingController();
  late DateTime _calFocusDay;
  late DateTime _calMonthAnchor;
  bool _calDayFilter = false;
  bool _calMonthStripOpen = false;
  CalendarHomeView _calView = CalendarHomeView.day;
  List<Map<String, dynamic>> _calendars = [];
  Set<int> _hiddenCalendarIds = {};
  bool _calSearchOpen = false;
  bool _calFabOpen = false;
  String _calQuery = '';
  final TextEditingController _calSearchCtrl = TextEditingController();
  final ScrollController _agendaScroll = ScrollController();
  final Map<String, GlobalKey> _agendaDayKeys = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _calFocusDay = DateTime(now.year, now.month, now.day);
    _calMonthAnchor = DateTime(now.year, now.month, 1);
    if (widget.initialItems.isNotEmpty) {
      _items = [
        for (final item in widget.initialItems)
          if (!isDeviceGoogleContact(item)) Map<String, dynamic>.from(item),
      ];
      _loading = _items.isEmpty;
    }
    _api = SuiteProductApi(
      gatewayBase: widget.gatewayBase,
      accessToken: widget.accessToken,
      onTokenRefresh: widget.refreshAccessToken,
    );
    _paintCachedItems();
    if (widget.product == SuiteProduct.tasks) {
      cloudityResolveInstalledVersion().then((version) {
        if (!mounted) return;
        setState(() => _installedVersion = version);
      });
    }
    _reload();
  }

  Future<void> _paintCachedItems() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('hubera_suite_list_${widget.product.name}');
    if (!mounted || raw == null || raw.isEmpty || _items.isNotEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      final items = <Map<String, dynamic>>[];
      for (final item in decoded) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        if (isDeviceGoogleContact(map)) continue;
        items.add(map);
      }
      if (items.isEmpty) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (_) {}
  }

  Future<void> _rememberItems() async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'hubera_suite_list_${widget.product.name}';
    final payload = suiteHomeCachePayload([
      for (final item in _items)
        if (!isDeviceGoogleContact(item)) item,
    ]);
    if (payload == null) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, payload);
  }

  @override
  void dispose() {
    _agendaScroll.dispose();
    _calSearchCtrl.dispose();
    _taskAddCtrl.dispose();
    _blockNumberField.dispose();
    _contactSearchCtrl.dispose();
    for (final controller in _contactScroll.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadContactPlacement() async {
    if (_placementReady || widget.product != SuiteProduct.contacts) return;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('hubera_contacts_placement_v1');
    if (raw != null && raw.isNotEmpty) {
      _placementHadPrefs = true;
      try {
        _placement = ContactPlacement.fromJson(jsonDecode(raw));
      } catch (_) {}
    }
    _placementReady = true;
  }

  Future<void> _saveContactPlacement() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hubera_contacts_placement_v1', jsonEncode(_placement.toJson()));
    _placementHadPrefs = true;
  }

  void _restoreContactScroll(ContactShelf shelf, double saved) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = _contactScroll[shelf];
      if (controller == null || !controller.hasClients) return;
      controller.jumpTo(
        contactScrollRestore(saved, controller.position.maxScrollExtent),
      );
    });
  }

  Future<void> _checkOwnAppUpdate() {
    final app = widget.product.suiteApp;
    return cloudityCheckUpdateManually(
      context,
      gatewayBase: widget.gatewayBase,
      appSlug: app.otaAppSlug,
      appName: widget.product.title,
      huberaHost: app.huberaHost,
    );
  }

  String? _emailFromAccess(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final map = jsonDecode(payload);
      if (map is! Map) return null;
      final email = map['email']?.toString().trim() ?? '';
      if (email.contains('@')) return email;
    } catch (_) {}
    return null;
  }

  Future<void> _checkContactsUpdate() async {
    final version = await cloudityResolveInstalledVersion();
    if (!mounted) return;
    final hosted = await CloudityOtaClient.fetchHuberaUpdates(
      host: widget.product.suiteApp.huberaHost,
    );
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (hosted == null || hosted.version.isEmpty || hosted.apkUrl.isEmpty) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Vérification impossible. Réessaie quand le réseau répond.'),
        ),
      );
      return;
    }
    if (cloudityCompareVersions(hosted.version, version) <= 0) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Aucune mise à jour plus récente. Cette version ($version) est à jour.',
          ),
        ),
      );
      return;
    }
    await cloudityShowOtaDialog(
      context,
      manifest: hosted,
      currentVersion: version,
    );
  }

  String _contactsAppBarTitle() {
    if (_selectedContactKeys.isNotEmpty) {
      final n = _selectedContactKeys.length;
      return '$n sélectionné${n > 1 ? 's' : ''}';
    }
    return switch (_contactShelf) {
      ContactShelf.archive => 'Archive',
      ContactShelf.trash => 'Corbeille',
      ContactShelf.blocked => 'Bloqués',
      ContactShelf.active => _contactsNav == 'organize' ? 'Organiser' : widget.product.title,
    };
  }

  String _notesAppBarTitle() {
    if (_notesSection == NotesHomeSection.notes &&
        _noteLabelFilter != null &&
        _noteLabelFilter!.isNotEmpty) {
      return _noteLabelFilter!;
    }
    return switch (_notesSection) {
      NotesHomeSection.trash => 'Corbeille',
      NotesHomeSection.archive => 'Archive',
      NotesHomeSection.reminders => 'Rappels',
      NotesHomeSection.notes => widget.product.title,
    };
  }

  NotesHomeSection get _notesSection {
    if (_notesShowTrash) return NotesHomeSection.trash;
    if (_notesShowArchived) return NotesHomeSection.archive;
    if (_notesRemindersOnly) return NotesHomeSection.reminders;
    return NotesHomeSection.notes;
  }

  Future<void> _ensureNotesPrefs() async {
    if (_notesPrefsLoaded || widget.product != SuiteProduct.notes) return;
    final prefs = await SharedPreferences.getInstance();
    _customLabels = prefs.getStringList('hubera_notes_labels_v1') ?? [];
    final raw = prefs.getString('hubera_notes_trash_v1');
    if (raw != null && raw.isNotEmpty) {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        _trashAt
          ..clear()
          ..addAll(decoded.map((k, v) => MapEntry(k.toString(), v.toString())));
      }
    }
    _notesPrefsLoaded = true;
  }

  Future<void> _saveTrash() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hubera_notes_trash_v1', jsonEncode(_trashAt));
  }

  Future<void> _saveCustomLabels() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('hubera_notes_labels_v1', _customLabels);
  }

  bool _noteIsTrashed(Map<String, dynamic> item) {
    final id = suiteItemId(item);
    if (id == null) return false;
    return _trashAt.containsKey('$id');
  }

  /// Efface seulement les notes déjà à la corbeille dont les 60 jours sont écoulés.
  Future<void> _purgeExpiredTrash() async {
    if (widget.product != SuiteProduct.notes || _trashAt.isEmpty) return;
    final due = noteIdsDueForPermanentDelete(
      trashedAtById: Map<String, String>.from(_trashAt),
      now: DateTime.now().toUtc(),
    );
    if (due.isEmpty) return;
    var changed = false;
    for (final id in due) {
      try {
        await _api.deleteNote(id);
        _trashAt.remove('$id');
        changed = true;
      } catch (e) {
        final msg = e.toString().toLowerCase();
        if (msg.contains('404') || msg.contains('not found')) {
          _trashAt.remove('$id');
          changed = true;
        }
      }
    }
    if (changed) await _saveTrash();
  }

  Future<void> _moveNoteToTrash(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    _trashAt['$id'] = DateTime.now().toUtc().toIso8601String();
    await _saveTrash();
    if (!mounted) return;
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Note mise à la corbeille')),
    );
  }

  Future<void> _restoreNote(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    _trashAt.remove('$id');
    await _saveTrash();
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _addNoteLabel() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nouveau libellé'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Nom du libellé'),
          onSubmitted: (value) => Navigator.pop(ctx, value),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Ajouter')),
        ],
      ),
    );
    ctrl.dispose();
    final trimmed = name?.trim() ?? '';
    if (trimmed.isEmpty || !mounted) return;
    final known = _allNoteLabels.where((label) => label.toLowerCase() == trimmed.toLowerCase());
    if (known.isNotEmpty) {
      setState(() {
        _noteLabelFilter = known.first;
        _notesShowTrash = false;
        _notesShowArchived = false;
        _notesRemindersOnly = false;
        _showSettings = false;
      });
      return;
    }
    setState(() {
      _customLabels = [..._customLabels, trimmed];
      _noteLabelFilter = trimmed;
      _notesShowTrash = false;
      _notesShowArchived = false;
      _notesRemindersOnly = false;
      _showSettings = false;
    });
    await _saveCustomLabels();
  }

  void _rememberNoteLabel(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return;
    if (_allNoteLabels.any((label) => label.toLowerCase() == trimmed.toLowerCase())) {
      return;
    }
    setState(() => _customLabels = [..._customLabels, trimmed]);
    _saveCustomLabels();
  }

  Future<void> _openNotesComposer() {
    return _openEditor();
  }

  void _selectNotesSection(NotesHomeSection section) {
    setState(() {
      _showSettings = false;
      _notesShowTrash = section == NotesHomeSection.trash;
      _notesShowArchived = section == NotesHomeSection.archive;
      _notesRemindersOnly = section == NotesHomeSection.reminders;
      _noteLabelFilter = null;
    });
    _reload();
  }

  Future<void> _reload() async {
    if (widget.product == SuiteProduct.notes) {
      await _ensureNotesPrefs();
      await _purgeExpiredTrash();
    }
    if (widget.product == SuiteProduct.contacts) {
      await _loadContactPlacement();
    }
    if (!mounted) return;
    setState(() {
      if (_items.isEmpty) _loading = true;
      _error = null;
    });
    try {
      final items = await _fetchItems();
      if (widget.product == SuiteProduct.calendar) {
        await _loadCalendarChrome();
      }
      if (!mounted) return;
      if (widget.product == SuiteProduct.contacts && !_placementHadPrefs) {
        final absorbed = placementFromProfiles(items);
        if (!absorbed.isEmpty) {
          _placement = absorbed;
          await _saveContactPlacement();
        }
      }
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
      await _rememberItems();
      if (widget.product == SuiteProduct.calendar) {
        await _rescheduleReminders();
      }
    } catch (e) {
      CloudityCrashReporter.trackNetworkError(e);
      if (!mounted) return;
      final cached = _items.isNotEmpty;
      final offline = isRealNetworkFailure(e);
      debugPrint(
        'hubera.suite ${widget.product.name} refresh ${e.runtimeType} offline=$offline cached=$cached',
      );
      setState(() {
        _loading = false;
        // Liste déjà peinte : le bandeau ne reste que si le réseau a lâché.
        // Un refresh suivant qui réussit repasse _error à null au début de _reload.
        if (cached && !offline) {
          _error = null;
        } else {
          _error = e.toString();
        }
      });
    }
    if (widget.product == SuiteProduct.contacts &&
        _contactDirectory == ContactDirectory.personal) {
      await _refreshDeviceGoogleIfAllowed();
    }
  }

  Future<void> _selectContactDirectory(ContactDirectory directory) async {
    setState(() => _contactDirectory = directory);
    if (directory == ContactDirectory.personal) {
      await _refreshDeviceGoogleIfAllowed();
    }
  }

  /// Relit le carnet si l’autorisation est déjà là. Ne demande rien.
  Future<void> _refreshDeviceGoogleIfAllowed() async {
    final granted = await DeviceGoogleContacts.permissionGranted();
    if (!mounted || !granted || _contactDirectory != ContactDirectory.personal) {
      return;
    }
    try {
      final raw = await DeviceGoogleContacts.read();
      if (!mounted) return;
      setState(() {
        _deviceGoogleContacts = personalContactsFromDevice(raw);
        _devicePermissionDenied = false;
      });
    } catch (_) {}
  }

  /// Geste : bouton Personnel. Demande READ_CONTACTS seulement ici.
  Future<void> _importDeviceGoogleContacts() async {
    if (_contactDirectory != ContactDirectory.personal) {
      setState(() => _contactDirectory = ContactDirectory.personal);
    }
    setState(() => _deviceContactsLoading = true);
    try {
      var granted = await DeviceGoogleContacts.permissionGranted();
      if (!granted) {
        granted = await DeviceGoogleContacts.requestPermission();
      }
      if (!mounted) return;
      if (!granted) {
        setState(() {
          _deviceContactsLoading = false;
          _devicePermissionDenied = true;
        });
        return;
      }
      final raw = await DeviceGoogleContacts.read();
      if (!mounted) return;
      setState(() {
        _deviceGoogleContacts = personalContactsFromDevice(raw);
        _deviceContactsLoading = false;
        _devicePermissionDenied = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _deviceContactsLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contacts Google indisponibles')),
      );
    }
  }

  Future<List<Map<String, dynamic>>> _fetchItems() async {
    switch (widget.product) {
      case SuiteProduct.calendar:
        final events = await _api.fetchCalendarEvents();
        List<Map<String, dynamic>> tasks = const [];
        try {
          tasks = await _api.fetchTasks();
        } catch (_) {}
        final merged = <Map<String, dynamic>>[
          ...events.map((e) => Map<String, dynamic>.from(e)),
        ];
        for (final raw in tasks) {
          final t = Map<String, dynamic>.from(raw);
          if (t['completed'] == true) continue;
          final due = t['due_at']?.toString() ?? t['start_at']?.toString();
          if (due == null || due.trim().isEmpty) continue;
          merged.add({
            ...t,
            'title': t['title'] ?? '(tâche)',
            'start_at': due,
            'end_at': due,
            '_hubera_task': true,
          });
        }
        merged.sort((a, b) {
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
        return merged;
      case SuiteProduct.contacts:
        return _api.fetchContacts();
      case SuiteProduct.notes:
        if (_notesShowTrash) {
          final active = await _api.fetchNotes(archived: false);
          final archived = await _api.fetchNotes(archived: true);
          final byId = <int, Map<String, dynamic>>{};
          for (final note in [...active, ...archived]) {
            final id = suiteItemId(note);
            if (id != null) byId[id] = note;
          }
          return byId.values.toList();
        }
        return _api.fetchNotes(archived: _notesShowArchived);
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
        final bits = <String>[if (when.isNotEmpty) when];
        if (rr != null) {
          final label = kCalendarRepeatOptions
              .where((o) => o.value == rr)
              .map((o) => o.label)
              .followedBy(const ['']).first;
          bits.add(label.isEmpty ? rr : label);
        }
        final remind = normalizeCalendarReminder(item['reminder_minutes']);
        if (remind != null) {
          bits.add(remind == 0 ? 'rappel à l’heure' : 'rappel ${remind} min');
        }
        return bits.isEmpty ? null : bits.join(' · ');
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
        final addr = contactAddressQuery(item);
        if (addr.isNotEmpty) bits.add(addr);
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

  Future<void> _openContactFiche(Map<String, dynamic> item) async {
    final shelf = _contactShelf;
    final controller = _contactScroll[shelf];
    final saved = controller != null && controller.hasClients ? controller.offset : 0.0;
    final key = contactStableKey(item);
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => ContactFicheScreen(
          item: item,
          api: _api,
          onChanged: _reload,
          readOnly: isDeviceGoogleContact(item),
          onArchive: shelf == ContactShelf.active ? () => _archiveContacts([key]) : null,
          onTrash: shelf == ContactShelf.active ? () => _trashContacts([key]) : null,
          onRestore: shelf == ContactShelf.archive || shelf == ContactShelf.trash
              ? () => _restoreContacts([key])
              : null,
          onPurge: shelf == ContactShelf.trash ? () => _purgeContact(item) : null,
          onBlockNumber: (number) => DeviceGoogleContacts.blockNumber(number),
        ),
      ),
    );
    if (!mounted) return;
    if (_contactShelf != shelf) {
      setState(() => _contactShelf = contactShelfAfterDetail(shelf));
    }
    if (changed == true) await _reload();
    if (mounted) _restoreContactScroll(shelf, saved);
  }

  Future<void> _openContactCreate() async {
    final directory =
        _contactDirectory == ContactDirectory.personal ? 'personal' : 'professional';
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        fullscreenDialog: true,
        builder: (_) => ContactEditorScreen(
          api: _api,
          directory: directory,
          onDeviceCopyRefused: (reason) {
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(reason)));
          },
        ),
      ),
    );
    if (saved == true && mounted) await _reload();
  }

  Map<String, dynamic>? _contactByKey(String key) {
    for (final item in [..._items, ..._deviceGoogleContacts]) {
      if (contactStableKey(item) == key) return item;
    }
    return null;
  }

  Future<void> _stampHubera(
    Map<String, dynamic> item, {
    String? directory,
    String? shelf,
    bool clearShelf = false,
  }) async {
    if (isDeviceGoogleContact(item)) return;
    final id = suiteItemId(item);
    if (id == null) return;
    final profile = item['profile'] is Map
        ? Map<String, dynamic>.from(item['profile'] as Map)
        : <String, dynamic>{};
    final extra = profile['extra'] is Map
        ? Map<String, dynamic>.from(profile['extra'] as Map)
        : <String, dynamic>{};
    if (directory != null) extra['directory'] = directory;
    if (clearShelf) {
      extra.remove('shelf');
      extra.remove('trashed_at');
    } else if (shelf != null) {
      extra['shelf'] = shelf;
      if (shelf == 'trash') {
        extra['trashed_at'] = DateTime.now().toUtc().toIso8601String();
      } else {
        extra.remove('trashed_at');
      }
    }
    if (extra.isEmpty) {
      profile.remove('extra');
    } else {
      profile['extra'] = extra;
    }
    try {
      await _api.updateContact(id: id, profile: profile);
      item['profile'] = profile;
    } catch (_) {}
  }

  Future<void> _moveSelectedContacts(String directory) async {
    final keys = Set<String>.from(_selectedContactKeys);
    if (keys.isEmpty) return;
    setState(() {
      _placement = _placement.assignDirectory(keys: keys, directory: directory);
      _selectedContactKeys.clear();
    });
    await _saveContactPlacement();
    for (final key in keys) {
      final item = _contactByKey(key);
      if (item != null) await _stampHubera(item, directory: directory);
    }
  }

  Future<void> _trashContacts(Iterable<String> keys) async {
    final list = keys.toList();
    setState(() {
      _placement = _placement.moveToTrash(
        keys: list,
        at: DateTime.now().toUtc().toIso8601String(),
      );
      _selectedContactKeys.removeAll(list);
    });
    await _saveContactPlacement();
    for (final key in list) {
      final item = _contactByKey(key);
      if (item != null) await _stampHubera(item, shelf: 'trash');
    }
  }

  Future<void> _archiveContacts(Iterable<String> keys) async {
    final list = keys.toList();
    setState(() {
      _placement = _placement.moveToArchive(keys: list);
      _selectedContactKeys.removeAll(list);
    });
    await _saveContactPlacement();
    for (final key in list) {
      final item = _contactByKey(key);
      if (item != null) await _stampHubera(item, shelf: 'archive');
    }
  }

  Future<void> _restoreContacts(Iterable<String> keys) async {
    final list = keys.toList();
    setState(() {
      _placement = _placement.restore(keys: list);
    });
    await _saveContactPlacement();
    for (final key in list) {
      final item = _contactByKey(key);
      if (item != null) await _stampHubera(item, clearShelf: true);
    }
  }

  Future<void> _purgeContact(Map<String, dynamic> item) async {
    final key = contactStableKey(item);
    if (isDeviceGoogleContact(item)) {
      final result = await DeviceGoogleContacts.deleteContact(
        lookup: (item['lookup'] ?? '').toString(),
      );
      if (!result.ok) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.reason.isEmpty
                  ? 'Le téléphone a refusé la suppression.'
                  : result.reason,
            ),
          ),
        );
        return;
      }
    } else {
      final id = suiteItemId(item);
      if (id != null) {
        try {
          await _api.deleteContact(id);
        } catch (_) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Suppression impossible')),
          );
          return;
        }
      }
    }
    if (!mounted) return;
    setState(() {
      _placement = _placement.forget(keys: [key]);
      _items.removeWhere((row) => contactStableKey(row) == key);
      _deviceGoogleContacts.removeWhere((row) => contactStableKey(row) == key);
    });
    await _saveContactPlacement();
  }

  Future<void> _loadBlockedNumbers() async {
    setState(() => _blockedLoading = true);
    final view = await DeviceGoogleContacts.blockedNumbers();
    if (!mounted) return;
    setState(() {
      _blocked = view;
      _blockedLoading = false;
      _blockedLoaded = true;
    });
  }

  Future<void> _blockTypedNumber() async {
    final number = _blockNumberField.text.trim();
    if (number.isEmpty) return;
    final attempt = await DeviceGoogleContacts.blockNumber(number);
    if (!mounted) return;
    if (!attempt.blocked) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            attempt.reason.isEmpty
                ? 'Le téléphone a refusé de bloquer ce numéro.'
                : attempt.reason,
          ),
        ),
      );
    } else {
      _blockNumberField.clear();
    }
    await _loadBlockedNumbers();
  }

  Future<void> _openBlockedDetail(String number) async {
    final saved = _contactScroll[ContactShelf.blocked]!.hasClients
        ? _contactScroll[ContactShelf.blocked]!.offset
        : 0.0;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (ctx) => Scaffold(
          appBar: AppBar(title: const Text('Numéro bloqué')),
          body: ListView(
            children: [
              ListTile(
                title: Text(number),
                subtitle: const Text('Tel que le téléphone l’a donné'),
              ),
              ListTile(
                leading: const Icon(Icons.lock_open_outlined),
                title: const Text('Débloquer'),
                onTap: () async {
                  final attempt = await DeviceGoogleContacts.unblockNumber(number);
                  if (!ctx.mounted) return;
                  if (!attempt.blocked) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(
                        content: Text(
                          attempt.reason.isEmpty
                              ? 'Le téléphone a refusé de débloquer ce numéro.'
                              : attempt.reason,
                        ),
                      ),
                    );
                    return;
                  }
                  Navigator.pop(ctx);
                },
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (_contactShelf != ContactShelf.blocked) {
      setState(() => _contactShelf = ContactShelf.blocked);
    }
    await _loadBlockedNumbers();
    _restoreContactScroll(ContactShelf.blocked, saved);
  }

  Future<void> _openEditor({
    Map<String, dynamic>? existing,
    bool noteAsChecklist = false,
    DateTime? seedStart,
    DateTime? seedRemind,
  }) async {
    if (widget.product == SuiteProduct.contacts) {
      if (existing != null) {
        await _openContactFiche(existing);
      } else {
        await _openContactCreate();
      }
      return;
    }
    if (existing != null && existing['_hubera_task'] == true) {
      await _openCalendarTaskSheet(existing);
      return;
    }
    final saved = await showSuiteProductEditor(
      context: context,
      product: widget.product,
      api: _api,
      existing: existing,
      taskListId: _selectedTaskListId,
      noteAsChecklist: noteAsChecklist,
      seedStart: seedStart,
      seedRemind: seedRemind,
      calendars: widget.product == SuiteProduct.calendar ? _calendars : const [],
      noteLabels: widget.product == SuiteProduct.notes ? _allNoteLabels : const [],
      noteInitialLabels: widget.product == SuiteProduct.notes &&
              existing == null &&
              _noteLabelFilter != null
          ? [_noteLabelFilter!]
          : const [],
      onNoteLabelCreated:
          widget.product == SuiteProduct.notes ? _rememberNoteLabel : null,
      onCalendarSaved: widget.product == SuiteProduct.calendar
          ? (event) {
              if (!mounted) return;
              final id = suiteItemId(event);
              setState(() {
                if (id != null) {
                  _items.removeWhere((it) => suiteItemId(it) == id);
                }
                _items.insert(0, event);
                final start = parseCloudityDateTime(
                  (event['start_at'] ?? event['starts_at'])?.toString(),
                );
                if (start != null) {
                  _calFocusDay = DateTime(start.year, start.month, start.day);
                  _calMonthAnchor = DateTime(start.year, start.month, 1);
                  _calView = CalendarHomeView.day;
                  _calDayFilter = false;
                }
              });
            }
          : null,
    );
    if (saved && mounted) await _reload();
  }

  Future<void> _openCalendarTaskSheet(Map<String, dynamic> item) async {
    final id = suiteItemId(item);
    if (id == null) return;
    final title = _itemTitle(item);
    final done = item['completed'] == true;
    final choice = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Tâche Hubera Tasks', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(ctx).textTheme.titleSmall),
            const SizedBox(height: 12),
            ListTile(
              leading: Icon(done ? Icons.check_box : Icons.check_box_outline_blank),
              title: Text(done ? 'Marquer comme à faire' : 'Marquer comme terminée'),
              onTap: () => Navigator.pop(ctx, 'toggle'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Supprimer'),
              onTap: () => Navigator.pop(ctx, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    try {
      if (choice == 'toggle') {
        await _api.updateTask(id: id, completed: !done);
      } else if (choice == 'delete') {
        if (!await confirmSuiteDelete(context, title)) return;
        await _api.deleteTask(id);
      }
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _deleteItem(Map<String, dynamic> item) async {
    if (widget.product == SuiteProduct.contacts) {
      await _trashContacts([contactStableKey(item)]);
      return;
    }
    if (widget.product == SuiteProduct.notes) {
      await _moveNoteToTrash(item);
      return;
    }
    final id = suiteItemId(item);
    if (id == null) return;
    if (!await confirmSuiteDelete(context, _itemTitle(item))) return;
    try {
      switch (widget.product) {
        case SuiteProduct.calendar:
          if (item['_hubera_task'] == true) {
            await _api.deleteTask(id);
          } else {
            await _api.deleteCalendarEvent(id);
          }
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

  Future<void> _archiveNote(Map<String, dynamic> item, {required bool archived}) async {
    final id = suiteItemId(item);
    if (id == null) return;
    try {
      await _api.updateNote(id: id, archived: archived);
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _setNoteColor(Map<String, dynamic> item, String color) async {
    final id = suiteItemId(item);
    if (id == null) return;
    try {
      await _api.updateNote(id: id, color: color);
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  List<String> _noteLabelBits(Map<String, dynamic> item) => noteLabelNames(item);

  List<String> get _allNoteLabels => noteLabelCatalog(
        custom: _customLabels,
        fromNotes: _items,
      );

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

  Widget _calendarViewPill(String label, CalendarHomeView view) {
    final theme = Theme.of(context);
    final selected = !_showSettings && _calView == view;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 2),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        tileColor: selected ? theme.colorScheme.secondaryContainer : null,
        title: Text(label),
        selected: selected,
        onTap: () {
          Navigator.pop(context);
          setState(() {
            _showSettings = false;
            _calView = view;
            _calFabOpen = false;
            _calMonthStripOpen = false;
          });
        },
      ),
    );
  }

  List<Widget> _productNavItems() {
    return [
      if (widget.product == SuiteProduct.calendar) ...[
        for (final spec in const <(String, CalendarHomeView)>[
          ('Planning', CalendarHomeView.agenda),
          ('Jour', CalendarHomeView.day),
          ('3 jours', CalendarHomeView.three),
          ('Semaine', CalendarHomeView.week),
          ('Mois', CalendarHomeView.month),
        ])
          _calendarViewPill(spec.$1, spec.$2),
        ListTile(
          leading: const Icon(Icons.refresh),
          title: const Text('Actualiser'),
          onTap: () {
            Navigator.pop(context);
            _reload();
          },
        ),
        if (_calendars.isNotEmpty) ...[
          const Divider(),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Text('Agendas'),
          ),
          for (final cal in _calendars)
            if (suiteItemId(cal) != null)
              CheckboxListTile(
                value: !_hiddenCalendarIds.contains(suiteItemId(cal)),
                secondary: Icon(
                  Icons.circle,
                  color: parseCalendarHex(cal['color_hex']?.toString()) ??
                      Theme.of(context).colorScheme.primary,
                ),
                title: Text(cal['name']?.toString() ?? 'Agenda'),
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (v) => _toggleCalendar(suiteItemId(cal)!, v != false),
              ),
        ],
      ] else if (widget.product == SuiteProduct.contacts) ...[
        ListTile(
          leading: const Icon(Icons.contacts_outlined),
          title: const Text('Contacts'),
          selected: !_showSettings && _contactShelf == ContactShelf.active,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _contactsNav = 'contacts';
              _contactShelf = ContactShelf.active;
              _selectedContactKeys.clear();
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.archive_outlined),
          title: const Text('Archive'),
          selected: !_showSettings && _contactShelf == ContactShelf.archive,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _contactsNav = 'organize';
              _contactShelf = ContactShelf.archive;
              _selectedContactKeys.clear();
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.delete_outline),
          title: const Text('Corbeille'),
          selected: !_showSettings && _contactShelf == ContactShelf.trash,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _contactsNav = 'organize';
              _contactShelf = ContactShelf.trash;
              _selectedContactKeys.clear();
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.block),
          title: const Text('Bloqués'),
          selected: !_showSettings && _contactShelf == ContactShelf.blocked,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _contactsNav = 'organize';
              _contactShelf = ContactShelf.blocked;
              _selectedContactKeys.clear();
            });
            _loadBlockedNumbers();
          },
        ),
      ] else if (widget.product != SuiteProduct.notes)
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
        ...buildNotesDrawerTiles(
          section: _notesSection,
          highlight: !_showSettings,
          selectedLabel: _notesSection == NotesHomeSection.notes ? _noteLabelFilter : null,
          labels: _allNoteLabels,
          onSection: (section) {
            Navigator.pop(context);
            _selectNotesSection(section);
          },
          onLabel: (label) {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _notesShowTrash = false;
              _notesShowArchived = false;
              _notesRemindersOnly = false;
              _noteLabelFilter = _noteLabelFilter == label ? null : label;
            });
          },
          onAddLabel: () {
            Navigator.pop(context);
            _addNoteLabel();
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

  String _contactInitials(String name) {
    final parts = name.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    String first(String s) => s.substring(0, 1).toUpperCase();
    if (parts.length == 1) return first(parts.first);
    return '${first(parts.first)}${first(parts.last)}';
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

  bool _isHuberaTask(Map<String, dynamic> item) => item['_hubera_task'] == true;

  List<Map<String, dynamic>> get _visibleCalendarItems =>
      visibleCalendarItems(_items, _hiddenCalendarIds);

  List<Map<String, dynamic>> _eventsBetween(DateTime start, DateTime end) {
    final all = expandCalendarEvents(
      _visibleCalendarItems,
      rangeStart: start,
      rangeEnd: end,
    );
    final q = _calQuery.trim().toLowerCase();
    if (q.isEmpty || widget.product != SuiteProduct.calendar) return all;
    return [
      for (final item in all)
        if (_itemTitle(item).toLowerCase().contains(q) ||
            (item['location']?.toString().toLowerCase().contains(q) ?? false) ||
            (item['description']?.toString().toLowerCase().contains(q) ?? false))
          item,
    ];
  }

  Future<void> _loadCalendarChrome() async {
    final prefs = await SharedPreferences.getInstance();
    final hidden = prefs.getStringList('hubera_calendar_hidden_v1') ?? const [];
    final ids = <int>{
      for (final raw in hidden)
        if (int.tryParse(raw) != null) int.parse(raw),
    };
    List<Map<String, dynamic>> cals = _calendars;
    try {
      cals = await _api.fetchCalendars();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _hiddenCalendarIds = ids;
      _calendars = cals;
    });
  }

  Future<void> _toggleCalendar(int id, bool visible) async {
    setState(() {
      if (visible) {
        _hiddenCalendarIds.remove(id);
      } else {
        _hiddenCalendarIds.add(id);
      }
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      'hubera_calendar_hidden_v1',
      [for (final n in _hiddenCalendarIds) '$n'],
    );
  }

  Future<void> _rescheduleReminders() async {
    if (huberaCalendarReminderHook == null) return;
    final now = DateTime.now();
    for (final item in _items) {
      if (_isHuberaTask(item)) continue;
      final id = suiteItemId(item);
      if (id == null) continue;
      final start = parseCloudityDateTime(
        (item['series_start_at'] ?? item['start_at'] ?? item['starts_at'])?.toString(),
      );
      final minutes = normalizeCalendarReminder(item['reminder_minutes']);
      if (start == null || minutes == null) {
        await dispatchCalendarReminder(
          CalendarReminderPlan(eventId: id, title: '', when: null, cancel: true),
        );
        continue;
      }
      final when = nextCalendarReminderAt(
        start: start,
        minutesBefore: minutes,
        repeatRule: item['repeat_rule']?.toString(),
        now: now,
      );
      await dispatchCalendarReminder(
        CalendarReminderPlan(
          eventId: id,
          title: item['title']?.toString() ?? 'Hubera Calendar',
          when: when,
          cancel: when == null,
        ),
      );
    }
  }

  void _shiftCalendar(int days) {
    setState(() {
      _calFocusDay = DateTime(
        _calFocusDay.year,
        _calFocusDay.month,
        _calFocusDay.day + days,
      );
      _calMonthAnchor = DateTime(_calFocusDay.year, _calFocusDay.month, 1);
    });
  }

  bool _dayHasCalendarItems(DateTime d) {
    final key = _dayKey(d);
    final span = _eventsBetween(
      d.subtract(const Duration(days: 1)),
      d.add(const Duration(days: 2)),
    );
    for (final item in span) {
      final start = parseCloudityDateTime(
        (item['start_at'] ?? item['starts_at'])?.toString(),
      );
      if (start == null) continue;
      final local = start.toLocal();
      if (_dayKey(DateTime(local.year, local.month, local.day)) == key) {
        return true;
      }
    }
    return false;
  }

  List<DateTime> _monthGridCells(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final mondayBased = (first.weekday + 6) % 7;
    final start = first.subtract(Duration(days: mondayBased));
    return List.generate(42, (i) => DateTime(start.year, start.month, start.day + i));
  }

  List<Map<String, dynamic>> _itemsOnDay(DateTime day) {
    final key = _dayKey(DateTime(day.year, day.month, day.day));
    final out = <Map<String, dynamic>>[];
    for (final item in _items) {
      final start = parseCloudityDateTime(
        (item['start_at'] ?? item['starts_at'])?.toString(),
      );
      if (start == null) continue;
      final local = start.toLocal();
      if (_dayKey(DateTime(local.year, local.month, local.day)) == key) {
        out.add(item);
      }
    }
    return out;
  }

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
            height: 80,
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
                          const SizedBox(height: 2),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (_dayHasCalendarItems(d))
                                Container(
                                  width: 5,
                                  height: 5,
                                  decoration: BoxDecoration(
                                    color: selected ? theme.colorScheme.onPrimary : accent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
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
    var items = widget.product == SuiteProduct.contacts
        ? contactsOnShelf(
            hubera: _items,
            device: _deviceGoogleContacts,
            placement: _placement,
            shelf: _contactShelf,
            directory: _contactShelf == ContactShelf.active ? _contactDirectory : null,
          )
        : _items;
    if (widget.product == SuiteProduct.notes) {
      items = items.where((n) {
        final trashed = _noteIsTrashed(n);
        if (_notesShowTrash) {
          if (!trashed) return false;
        } else {
          if (trashed) return false;
          final archived = n['archived'] == true;
          if (_notesShowArchived ? !archived : archived) return false;
          if (_notesRemindersOnly && n['remind_at'] == null) return false;
        }
        if (_noteLabelFilter != null && !_notesShowTrash) {
          if (!noteLabelNames(n).contains(_noteLabelFilter)) return false;
        }
        return true;
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
      final labels = (item['labels'] as List?)?.map((e) => e.toString()).join(' ') ?? '';
      final hay = [
        _itemTitle(item),
        _itemSubtitle(item) ?? '',
        item['email']?.toString() ?? '',
        item['phone']?.toString() ?? '',
        item['body']?.toString() ?? '',
        item['content']?.toString() ?? '',
        labels,
        widget.product == SuiteProduct.notes ? noteChecklistPlain(item) : '',
      ].join(' ').toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  /// Sync en cours ou en échec : on ne cache la liste que si rien n’est encore en cache.
  bool get _hideCachedHome => _items.isEmpty && (_loading || _error != null);

  Widget _cachedHomeFrame(Widget child) {
    if (!showCachedSyncBanner(error: _error, hasCachedItems: _items.isNotEmpty)) {
      return child;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Synchronisation interrompue. La liste enregistrée reste affichée.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                TextButton(onPressed: _reload, child: const Text('Réessayer')),
              ],
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }

  Widget _buildBlockedPane() {
    final theme = Theme.of(context);
    final bottom = 24 + MediaQuery.viewPaddingOf(context).bottom;
    if (!_blockedLoaded || _blockedLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    final numbers = _blocked.canRead ? _blocked.numbers : const <String>[];
    return SafeArea(
      top: false,
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!_blocked.canRead)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Text(
                _blocked.reason.isEmpty
                    ? 'Le téléphone ne donne pas la liste des numéros bloqués.'
                    : _blocked.reason,
                style: theme.textTheme.bodyMedium,
              ),
            ),
          Expanded(
            child: ListView.builder(
              controller: _contactScroll[ContactShelf.blocked],
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.only(bottom: bottom),
              itemCount: numbers.length + 1,
              itemBuilder: (context, index) {
                if (index == numbers.length) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _blockNumberField,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(labelText: 'Numéro à bloquer'),
                        ),
                        const SizedBox(height: 8),
                        FilledButton(
                          onPressed: _blockTypedNumber,
                          child: const Text('Bloquer'),
                        ),
                      ],
                    ),
                  );
                }
                final number = numbers[index];
                return ListTile(
                  title: Text(number),
                  onTap: () => _openBlockedDetail(number),
                  trailing: IconButton(
                    tooltip: 'Débloquer',
                    icon: const Icon(Icons.lock_open_outlined),
                    onPressed: () async {
                      final attempt = await DeviceGoogleContacts.unblockNumber(number);
                      if (!mounted) return;
                      if (!attempt.blocked) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              attempt.reason.isEmpty
                                  ? 'Le téléphone a refusé de débloquer ce numéro.'
                                  : attempt.reason,
                            ),
                          ),
                        );
                      }
                      await _loadBlockedNumbers();
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrganiser() {
    final theme = Theme.of(context);
    return ListView(
      padding: EdgeInsets.fromLTRB(0, 8, 0, 24 + MediaQuery.viewPaddingOf(context).bottom),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text('Organiser', style: theme.textTheme.titleMedium),
        ),
        ListTile(
          leading: const Icon(Icons.archive_outlined),
          title: const Text('Archive'),
          onTap: () => setState(() => _contactShelf = ContactShelf.archive),
        ),
        ListTile(
          leading: const Icon(Icons.delete_outline),
          title: const Text('Corbeille'),
          onTap: () => setState(() => _contactShelf = ContactShelf.trash),
        ),
        ListTile(
          leading: const Icon(Icons.block),
          title: const Text('Bloqués'),
          onTap: () {
            setState(() => _contactShelf = ContactShelf.blocked);
            _loadBlockedNumbers();
          },
        ),
      ],
    );
  }

  Widget _buildContactsDirectory() {
    if (_contactsNav == 'organize' && _contactShelf == ContactShelf.active) {
      return _buildOrganiser();
    }
    if (_contactShelf == ContactShelf.blocked) return _buildBlockedPane();
    final theme = Theme.of(context);
    final personal = _contactDirectory == ContactDirectory.personal;
    final visible = _visibleItems;
    final bottom = 88 + MediaQuery.viewPaddingOf(context).bottom;
    final selecting = _contactShelf == ContactShelf.active && _selectedContactKeys.isNotEmpty;
    return SafeArea(
      top: false,
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_contactShelf == ContactShelf.active &&
              (widget.userEmail ?? '').trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(
                widget.userEmail!.trim(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium,
              ),
            ),
          if (_contactShelf == ContactShelf.active)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Wrap(
                spacing: 8,
                children: [
                  FilterChip(
                    label: const Text('Personnel'),
                    selected: personal,
                    onSelected: (_) => _selectContactDirectory(ContactDirectory.personal),
                  ),
                  FilterChip(
                    label: const Text('Professionnel'),
                    selected: !personal,
                    onSelected: (_) => _selectContactDirectory(ContactDirectory.professional),
                  ),
                ],
              ),
            ),
          if (_contactShelf != ContactShelf.active)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: TextField(
                decoration: InputDecoration(
                  prefixIcon: Icon(Icons.search, color: theme.colorScheme.onSurfaceVariant),
                  hintText: 'Rechercher',
                  filled: true,
                  fillColor: theme.colorScheme.surfaceContainerHighest,
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(28),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: (v) => setState(() => _contactQuery = v),
              ),
            ),
          if (selecting)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 4, 4),
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 4,
                children: [
                  Text(
                    '${_selectedContactKeys.length} sélectionné${_selectedContactKeys.length > 1 ? 's' : ''}',
                    style: theme.textTheme.labelLarge,
                  ),
                  TextButton(
                    key: const Key('contacts-move-personal'),
                    onPressed: () => _moveSelectedContacts('personal'),
                    child: const Text('Personnel'),
                  ),
                  TextButton(
                    key: const Key('contacts-move-professional'),
                    onPressed: () => _moveSelectedContacts('professional'),
                    child: const Text('Professionnel'),
                  ),
                  IconButton(
                    tooltip: 'Annuler la sélection',
                    onPressed: () => setState(_selectedContactKeys.clear),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _reload,
              child: _contactsDirectoryScroll(visible, personal, bottom),
            ),
          ),
        ],
      ),
    );
  }

  Widget _contactsDirectoryScroll(
    List<Map<String, dynamic>> visible,
    bool personal,
    double bottom,
  ) {
    if (!personal && _hideCachedHome && _loading) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 120),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }
    if (!personal && _hideCachedHome && _error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          CloudityErrorBody(
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
          ),
        ],
      );
    }
    if (visible.isEmpty) {
      final theme = Theme.of(context);
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(24, 48, 24, bottom),
        children: [
          Center(
            child: Column(
              children: [
                Icon(
                  personal ? Icons.contact_phone_outlined : widget.product.icon,
                  size: 48,
                  color: theme.colorScheme.primary.withValues(alpha: 0.55),
                ),
                const SizedBox(height: 12),
                Text(
                  switch (_contactShelf) {
                    ContactShelf.archive => 'Aucune archive',
                    ContactShelf.trash => 'Corbeille vide',
                    ContactShelf.blocked => 'Aucun numéro bloqué',
                    ContactShelf.active =>
                      personal ? 'Aucun contact personnel' : _emptyTitle(),
                  },
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
                if (_contactShelf == ContactShelf.active && !personal) ...[
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _showCreateMenu,
                    icon: const Icon(Icons.add),
                    label: Text('Créer — ${widget.product.title}'),
                  ),
                ] else if (_contactShelf == ContactShelf.active) ...[
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _deviceContactsLoading ? null : _importDeviceGoogleContacts,
                    icon: const Icon(Icons.contact_phone_outlined),
                    label: Text(_devicePermissionDenied ? 'Autoriser' : 'Contacts Google'),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }
    final rows = <Object>[];
    if (_contactShelf == ContactShelf.active) {
      String? letter;
      for (final item in visible) {
        final name = _itemTitle(item).trim();
        final next = name.isEmpty ? '#' : name.substring(0, 1).toUpperCase();
        if (next != letter) {
          rows.add(next);
          letter = next;
        }
        rows.add(item);
      }
    } else {
      rows.addAll(visible);
    }
    return ListView.builder(
      controller: _contactScroll[_contactShelf],
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.only(top: 4, bottom: bottom),
      itemCount: rows.length,
      itemBuilder: (context, index) {
        final row = rows[index];
        if (row is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Text(row, style: Theme.of(context).textTheme.titleSmall),
          );
        }
        final theme = Theme.of(context);
        final item = row as Map<String, dynamic>;
        final sub = _itemSubtitle(item);
        final key = contactStableKey(item);
        final selected = _selectedContactKeys.contains(key);
        final selecting = _contactShelf == ContactShelf.active &&
            (_contactsNav == 'select' || _selectedContactKeys.isNotEmpty);
        return Column(
          children: [
            ListTile(
              selected: selected,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
              leading: CircleAvatar(
                backgroundColor: selected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.primaryContainer,
                foregroundColor: selected
                    ? theme.colorScheme.onPrimary
                    : theme.colorScheme.onPrimaryContainer,
                child: Text(
                  _contactInitials(_itemTitle(item)),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
              title: Text(
                _itemTitle(item),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface),
              ),
              subtitle: sub != null
                  ? Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                    )
                  : null,
              trailing: switch (_contactShelf) {
                ContactShelf.trash => Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: 'Restaurer',
                        icon: const Icon(Icons.restore),
                        onPressed: () => _restoreContacts([key]),
                      ),
                      IconButton(
                        tooltip: 'Supprimer définitivement',
                        icon: const Icon(Icons.delete_forever_outlined),
                        onPressed: () => _purgeContact(item),
                      ),
                    ],
                  ),
                ContactShelf.archive => IconButton(
                    tooltip: 'Restaurer',
                    icon: const Icon(Icons.restore),
                    onPressed: () => _restoreContacts([key]),
                  ),
                _ => null,
              },
              onLongPress: _contactShelf == ContactShelf.active
                  ? () => setState(() {
                        if (selected) {
                          _selectedContactKeys.remove(key);
                        } else {
                          _selectedContactKeys.add(key);
                        }
                      })
                  : null,
              onTap: () {
                if (selecting) {
                  setState(() {
                    if (selected) {
                      _selectedContactKeys.remove(key);
                    } else {
                      _selectedContactKeys.add(key);
                    }
                  });
                  return;
                }
                _openEditor(existing: item);
              },
            ),
            Divider(
              height: 1,
              indent: 72,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.45),
            ),
          ],
        );
      },
    );
  }

  Widget _buildListBody() {
    if (widget.product == SuiteProduct.contacts) {
      return _cachedHomeFrame(_buildContactsDirectory());
    }
    return _cachedHomeFrame(
      RefreshIndicator(
      onRefresh: _reload,
      child: _hideCachedHome && _loading
          ? ListView(
              children: const [
                SizedBox(height: 120),
                Center(child: CircularProgressIndicator()),
              ],
            )
                  : _hideCachedHome && _error != null
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
                  : widget.product == SuiteProduct.calendar
                  ? _buildCalendarList()
                  : _items.isEmpty && widget.product != SuiteProduct.tasks
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
                      : widget.product == SuiteProduct.tasks
                      ? _buildTasksList()
                      : ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: _visibleItems.length,
                      itemBuilder: (context, index) {
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
                            leading: widget.product == SuiteProduct.contacts
                                    ? CircleAvatar(
                                        child: Text(
                                          _contactInitials(_itemTitle(item)),
                                          style: const TextStyle(fontSize: 14),
                                        ),
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
      ),
    );
  }

  Widget _buildTasksList() {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.only(bottom: 88),
      children: [
        _buildTasksHeader(),
        if (_visibleItems.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 28, 16, 8),
            child: Text(
              'Aucune tâche',
              style: theme.textTheme.titleMedium,
            ),
          ),
        for (final item in _visibleItems) _buildTaskRow(item),
        _buildTaskAddRow(),
      ],
    );
  }

  Widget _buildTaskRow(Map<String, dynamic> item) {
    final theme = Theme.of(context);
    final done = item['completed'] == true;
    final sub = _itemSubtitle(item);
    return InkWell(
      onTap: () => _openEditor(existing: item),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Checkbox(
              value: done,
              onChanged: (_) => _toggleTask(item),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 12, right: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _itemTitle(item),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: done
                          ? TextStyle(
                              decoration: TextDecoration.lineThrough,
                              color: theme.colorScheme.onSurfaceVariant,
                            )
                          : theme.textTheme.bodyLarge,
                    ),
                    if (sub != null)
                      Text(
                        sub,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTaskAddRow() {
    return TextField(
      controller: _taskAddCtrl,
      textInputAction: TextInputAction.done,
      decoration: const InputDecoration(
        prefixIcon: Icon(Icons.add),
        hintText: 'Ajouter une tâche',
        border: InputBorder.none,
        isDense: true,
      ),
      onSubmitted: _quickAddTask,
    );
  }

  Future<void> _quickAddTask(String raw) async {
    final title = raw.trim();
    if (title.isEmpty) return;
    try {
      await _api.createTask(title: title, listId: _selectedTaskListId);
      _taskAddCtrl.clear();
      if (mounted) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
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
    return noteKeepColor(id, Theme.of(context).colorScheme);
  }

  Widget _keepNoteCard(Map<String, dynamic> item) {
    final theme = Theme.of(context);
    final pinned = item['pinned'] == true;
    final archived = item['archived'] == true;
    final colorId = item['color']?.toString();
    final bg = _keepNoteColor(colorId, theme.brightness);
    final title = item['title']?.toString() ?? '';
    final body =
        item['body']?.toString() ?? item['content']?.toString() ?? '';
    final remind = item['remind_at']?.toString();
    final labelBits = _noteLabelBits(item);
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
        onLongPress: () => _showNoteCardMenu(item),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: title.isEmpty
                        ? const SizedBox.shrink()
                        : Text(
                            title,
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
                  PopupMenuButton<String>(
                    tooltip: 'Plus',
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.more_vert, size: 18),
                    onSelected: (v) => _onNoteCardAction(item, v),
                    itemBuilder: (ctx) => [
                      if (_notesShowTrash)
                        const PopupMenuItem(
                          value: 'restore',
                          child: Text('Restaurer'),
                        )
                      else ...[
                        PopupMenuItem(
                          value: 'pin',
                          child: Text(pinned ? 'Désépingler' : 'Épingler'),
                        ),
                        PopupMenuItem(
                          value: 'archive',
                          child: Text(archived ? 'Désarchiver' : 'Archiver'),
                        ),
                        const PopupMenuItem(
                          value: 'color',
                          child: Text('Couleur'),
                        ),
                        const PopupMenuItem(
                          value: 'delete',
                          child: Text('Mettre à la corbeille'),
                        ),
                      ],
                    ],
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
              if (item['extras'] is Map &&
                  (item['extras'] as Map)['checklist'] is List) ...[
                const SizedBox(height: 6),
                ...(((item['extras'] as Map)['checklist'] as List).take(6).map((raw) {
                  if (raw is! Map) return const SizedBox.shrink();
                  final done = raw['done'] == true;
                  final t = raw['text']?.toString() ?? '';
                  if (t.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Row(
                      children: [
                        Icon(
                          done
                              ? Icons.check_box
                              : Icons.check_box_outline_blank,
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            t,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              decoration: done
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                })),
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
              if (_notesShowTrash) ...[
                const SizedBox(height: 8),
                Text(
                  _trashExpiryLabel(item),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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
                      ActionChip(
                        visualDensity: VisualDensity.compact,
                        label: Text(lab, style: theme.textTheme.labelSmall),
                        onPressed: () => setState(() {
                          _noteLabelFilter =
                              _noteLabelFilter == lab ? null : lab;
                        }),
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

  Future<void> _onNoteCardAction(Map<String, dynamic> item, String action) async {
    switch (action) {
      case 'pin':
        await _toggleNotePin(item);
      case 'archive':
        await _archiveNote(item, archived: item['archived'] != true);
      case 'color':
        await _pickNoteColor(item);
      case 'delete':
        await _moveNoteToTrash(item);
      case 'restore':
        await _restoreNote(item);
    }
  }

  String _trashExpiryLabel(Map<String, dynamic> item) {
    final id = suiteItemId(item);
    final raw = id == null ? null : _trashAt['$id'];
    final at = raw == null ? null : DateTime.tryParse(raw);
    if (at == null) return 'Suppression définitive sous 60 jours';
    final when = formatCloudityDayHeaderFromDate(noteTrashExpiresAt(at).toLocal());
    return 'Suppression définitive le $when';
  }

  Future<void> _showNoteCardMenu(Map<String, dynamic> item) async {
    final archived = item['archived'] == true;
    final pinned = item['pinned'] == true;
    final choice = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Note', style: Theme.of(ctx).textTheme.titleMedium),
            if (_notesShowTrash)
              ListTile(
                leading: const Icon(Icons.restore),
                title: const Text('Restaurer'),
                onTap: () => Navigator.pop(ctx, 'restore'),
              )
            else ...[
              ListTile(
                leading: Icon(pinned ? Icons.push_pin : Icons.push_pin_outlined),
                title: Text(pinned ? 'Désépingler' : 'Épingler'),
                onTap: () => Navigator.pop(ctx, 'pin'),
              ),
              ListTile(
                leading: Icon(archived ? Icons.unarchive_outlined : Icons.archive_outlined),
                title: Text(archived ? 'Désarchiver' : 'Archiver'),
                onTap: () => Navigator.pop(ctx, 'archive'),
              ),
              ListTile(
                leading: const Icon(Icons.palette_outlined),
                title: const Text('Couleur'),
                onTap: () => Navigator.pop(ctx, 'color'),
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Mettre à la corbeille'),
                onTap: () => Navigator.pop(ctx, 'delete'),
              ),
            ],
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    await _onNoteCardAction(item, choice);
  }

  Future<void> _pickNoteColor(Map<String, dynamic> item) async {
    final current = item['color']?.toString() ?? 'default';
    final picked = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) {
        final theme = Theme.of(ctx);
        return Padding(
          padding: suiteBottomSheetPadding(ctx),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Couleur', style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final c in kNoteColorOptions)
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx, c.id),
                      child: Column(
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: _keepNoteColor(c.id, theme.brightness),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: current == c.id
                                    ? theme.colorScheme.onSurface
                                    : theme.colorScheme.outlineVariant,
                                width: current == c.id ? 2 : 1,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(c.label, style: theme.textTheme.labelSmall),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
    if (picked != null && mounted) await _setNoteColor(item, picked);
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
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _items.isEmpty) {
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
          if (_notesShowTrash)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                'Suppression définitive 60 jours après la mise à la corbeille.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            )
          else
            Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Material(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
              elevation: 0,
              borderRadius: BorderRadius.circular(28),
              child: InkWell(
                borderRadius: BorderRadius.circular(28),
                onTap: _openNotesComposer,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
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
                        onPressed: () => _openEditor(noteAsChecklist: true),
                      ),
                      IconButton(
                        tooltip: 'Rappel',
                        icon: const Icon(Icons.notifications_outlined),
                        onPressed: () => _openEditor(
                          seedRemind: DateTime.now().add(const Duration(hours: 1)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_allNoteLabels.isNotEmpty)
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: const Text('Tout'),
                      selected: _noteLabelFilter == null && !_notesRemindersOnly,
                      onSelected: (_) => setState(() {
                        _noteLabelFilter = null;
                        _notesRemindersOnly = false;
                      }),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      avatar: const Icon(Icons.notifications_outlined, size: 16),
                      label: const Text('Rappels'),
                      selected: _notesRemindersOnly,
                      onSelected: (v) => setState(() => _notesRemindersOnly = v),
                    ),
                  ),
                  for (final lab in _allNoteLabels)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(lab),
                        selected: _noteLabelFilter == lab,
                        onSelected: (v) => setState(() {
                          _noteLabelFilter = v ? lab : null;
                        }),
                      ),
                    ),
                ],
              ),
            ),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
              child: Column(
                children: [
                  Icon(
                    _notesShowTrash
                        ? Icons.delete_outline
                        : _notesShowArchived
                            ? Icons.archive_outlined
                            : Icons.sticky_note_2_outlined,
                    size: 48,
                    color: theme.colorScheme.primary.withValues(alpha: 0.55),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _notesShowTrash
                        ? 'Corbeille vide'
                        : _notesShowArchived
                            ? 'Aucune archive'
                            : _emptyTitle(),
                    style: theme.textTheme.titleMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _notesShowTrash
                        ? 'Les notes restent ici 60 jours, puis elles sont supprimées définitivement.'
                        : _notesShowArchived
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

  void _shiftCalendarMonth(int delta) {
    setState(() {
      _calMonthAnchor = DateTime(_calMonthAnchor.year, _calMonthAnchor.month + delta);
    });
  }

  Widget _monthNav() {
    final theme = Theme.of(context);
    final raw = '${_monthName(_calMonthAnchor.month)} ${_calMonthAnchor.year}';
    final label = raw.isEmpty ? raw : raw[0].toUpperCase() + raw.substring(1);
    return Row(
      children: [
        IconButton(
          tooltip: 'Mois précédent',
          onPressed: () => _shiftCalendarMonth(-1),
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSurface,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Mois suivant',
          onPressed: () => _shiftCalendarMonth(1),
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }

  Widget _monthCells({
    required DateTime today,
    required Color accent,
    required bool compact,
    required void Function(DateTime day) onPick,
  }) {
    final theme = Theme.of(context);
    const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    final cells = _monthGridCells(_calMonthAnchor);
    final chipsByDay = <int, List<Map<String, dynamic>>>{};
    if (!compact && cells.isNotEmpty) {
      final end = cells.last.add(const Duration(days: 1));
      for (final item in _eventsBetween(cells.first, end)) {
        final start = parseCloudityDateTime(
          (item['start_at'] ?? item['starts_at'])?.toString(),
        );
        if (start == null) continue;
        final local = start.toLocal();
        final key = DateTime(local.year, local.month, local.day).millisecondsSinceEpoch;
        (chipsByDay[key] ??= []).add(item);
      }
    }
    Widget dayCell(DateTime day) {
      final inMonth = day.month == _calMonthAnchor.month;
      final isToday = day == today;
      final selected = day == _calFocusDay;
      final fg = isToday
          ? theme.colorScheme.onPrimary
          : (inMonth ? theme.colorScheme.onSurface : theme.colorScheme.outline);
      final number = Container(
        width: compact ? 28 : 22,
        height: compact ? 28 : 22,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isToday
              ? accent
              : (selected ? accent.withValues(alpha: 0.16) : Colors.transparent),
          shape: BoxShape.circle,
          border: selected && !isToday ? Border.all(color: accent, width: 1.5) : null,
        ),
        child: Text(
          '${day.day}',
          style: theme.textTheme.labelLarge?.copyWith(
            color: fg,
            fontWeight: FontWeight.w700,
            height: 1,
            fontSize: compact ? null : 12,
          ),
        ),
      );
      if (compact) {
        final hasItems = _dayHasCalendarItems(day);
        return InkWell(
          onTap: () => onPick(day),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              number,
              const SizedBox(height: 2),
              Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  color: hasItems ? accent : Colors.transparent,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
        );
      }
      final chips = (chipsByDay[day.millisecondsSinceEpoch] ?? const <Map<String, dynamic>>[])
          .take(3)
          .toList();
      return InkWell(
        onTap: () => onPick(day),
        child: Padding(
          padding: const EdgeInsets.all(1),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(alignment: Alignment.topCenter, child: number),
              for (final item in chips)
                Container(
                  margin: const EdgeInsets.only(top: 1),
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: colorForCalendarEvent(item, _calendars, accent),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Text(
                    _itemTitle(item),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 9, color: Colors.white, height: 1.2),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    final weekRows = <Widget>[
      for (var w = 0; w < 6; w++)
        if (compact)
          SizedBox(
            height: 40,
            child: Row(
              children: [
                for (var d = 0; d < 7; d++) Expanded(child: dayCell(cells[w * 7 + d])),
              ],
            ),
          )
        else
          Expanded(
            child: Row(
              children: [
                for (var d = 0; d < 7; d++) Expanded(child: dayCell(cells[w * 7 + d])),
              ],
            ),
          ),
    ];

    return Column(
      key: const Key('calendar-month-grid'),
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
          child: Row(
            children: [
              for (final w in weekdays)
                Expanded(
                  child: Center(
                    child: Text(
                      w,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (compact)
          ...weekRows
        else
          Expanded(child: Column(children: weekRows)),
      ],
    );
  }

  Widget _buildMonthNumberStrip(DateTime today, Color accent) {
    final maxH = MediaQuery.sizeOf(context).height * 0.46;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxH),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _monthNav(),
            _monthCells(
              today: today,
              accent: accent,
              compact: true,
              onPick: (day) {
                setState(() {
                  _calFocusDay = DateTime(day.year, day.month, day.day);
                  _calMonthAnchor = DateTime(day.year, day.month, 1);
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _calendarMonthTitle() {
    final anchor = _calView == CalendarHomeView.month ? _calMonthAnchor : _calFocusDay;
    final raw = _monthName(anchor.month);
    final label = raw.isEmpty ? raw : raw[0].toUpperCase() + raw.substring(1);
    return InkWell(
      onTap: () => setState(() {
        _calView = CalendarHomeView.month;
        _calFabOpen = false;
        _showSettings = false;
      }),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const Icon(Icons.arrow_drop_down),
        ],
      ),
    );
  }

  Widget _calendarSearchField() {
    return TextField(
      controller: _calSearchCtrl,
      autofocus: true,
      decoration: const InputDecoration(
        hintText: 'Rechercher',
        border: InputBorder.none,
        isDense: true,
      ),
      onChanged: (v) => setState(() => _calQuery = v),
    );
  }

  Widget _calendarTodayButton() {
    final day = DateTime.now().day;
    return IconButton(
      tooltip: 'Aujourd’hui',
      onPressed: () {
        final n = DateTime.now();
        final t = DateTime(n.year, n.month, n.day);
        setState(() {
          _calMonthAnchor = DateTime(t.year, t.month);
          _calFocusDay = t;
          _calFabOpen = false;
        });
        _jumpToCalendarDay(t, filter: false);
      },
      icon: SizedBox(
        width: 24,
        height: 24,
        child: Stack(
          alignment: Alignment.center,
          children: [
            const Icon(Icons.calendar_today_outlined),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '$day',
                style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, height: 1),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _calendarCreateFab() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (_calFabOpen)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: FloatingActionButton.extended(
              heroTag: 'hubera-cal-event',
              onPressed: () {
                setState(() => _calFabOpen = false);
                _openEditor();
              },
              icon: const Icon(Icons.event_outlined),
              label: const Text('Événement'),
            ),
          ),
        FloatingActionButton(
          heroTag: 'hubera-cal-add',
          tooltip: _calFabOpen ? 'Fermer' : 'Créer',
          onPressed: () => setState(() => _calFabOpen = !_calFabOpen),
          child: Icon(_calFabOpen ? Icons.close : Icons.add),
        ),
      ],
    );
  }

  Widget _dayRail(DateTime day, DateTime today, Color accent, List<Map<String, dynamic>> items) {
    final theme = Theme.of(context);
    final isToday = calendarStartOfDay(day) == today;
    const wd = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
    final allDay = [
      for (final item in items)
        if (calendarItemAllDay(item)) item,
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 56,
            child: Column(
              children: [
                Text(wd[day.weekday - 1], style: theme.textTheme.labelMedium),
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isToday ? accent : null,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${day.day}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: isToday ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
                    ),
                  ),
                ),
                IconButton(
                  key: const Key('calendar-day-header'),
                  tooltip: _calMonthStripOpen ? 'Replier le mois' : 'Déplier le mois',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => setState(() => _calMonthStripOpen = !_calMonthStripOpen),
                  icon: Icon(_calMonthStripOpen ? Icons.expand_less : Icons.expand_more),
                ),
              ],
            ),
          ),
          Expanded(
            child: allDay.isEmpty
                ? const SizedBox(height: 8)
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in allDay.take(4))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Material(
                            color: colorForCalendarEvent(item, _calendars, accent),
                            borderRadius: BorderRadius.circular(4),
                            child: InkWell(
                              onTap: () => _openEditor(existing: item),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                child: Text(
                                  _itemTitle(item),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: theme.colorScheme.onPrimary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (allDay.length > 4)
                        Text('+${allDay.length - 4}', style: theme.textTheme.labelMedium),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimedCalendar({
    required DateTime today,
    required Color accent,
    required List<DateTime> days,
    required bool showDayHeaders,
  }) {
    final reveal = DateTime.now().hour.clamp(0, 18);
    final rangeStart = days.first.subtract(const Duration(days: 1));
    final rangeEnd = days.last.add(const Duration(days: 2));
    final items = _eventsBetween(rangeStart, rangeEnd);
    final step = days.length >= 7 ? 7 : 1;
    final single = days.length == 1;
    return GestureDetector(
      onHorizontalDragEnd: (details) {
        final v = details.primaryVelocity ?? 0;
        if (v > 280) _shiftCalendar(-step);
        if (v < -280) _shiftCalendar(step);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (single) _dayRail(days.first, today, accent, items),
          if (_calMonthStripOpen && single) _buildMonthNumberStrip(today, accent),
          Expanded(
            child: CalendarTimeGrid(
              key: const Key('calendar-hour-grid'),
              days: days,
              items: items,
              accent: accent,
              showDayHeaders: showDayHeaders,
              showAllDay: !single,
              revealHour: reveal,
              showNowLine: true,
              itemTitle: _itemTitle,
              isTask: _isHuberaTask,
              eventColor: (item) => colorForCalendarEvent(item, _calendars, accent),
              onDayHeaderTap: (d) => setState(() {
                _calFocusDay = DateTime(d.year, d.month, d.day);
                _calMonthAnchor = DateTime(d.year, d.month, 1);
                _calView = CalendarHomeView.day;
                _calMonthStripOpen = false;
                _calFabOpen = false;
              }),
              onEventTap: (item) => _openEditor(existing: item),
              onSlotTap: (start) => _openEditor(seedStart: start),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarMonth(DateTime today, Color accent) {
    return Column(
      children: [
        _monthNav(),
        Expanded(
          child: _monthCells(
            today: today,
            accent: accent,
            compact: false,
            onPick: (day) {
              setState(() {
                _calFocusDay = DateTime(day.year, day.month, day.day);
                _calMonthAnchor = DateTime(day.year, day.month, 1);
                _calDayFilter = true;
                _calView = CalendarHomeView.day;
                _calMonthStripOpen = false;
              });
            },
          ),
        ),
      ],
    );
  }

  String _monthName(int m) {
    const names = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ];
    if (m < 1 || m > 12) return '';
    return names[m - 1];
  }

  Widget _buildCalendarList() {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (_calView == CalendarHomeView.month) {
      return _buildCalendarMonth(today, accent);
    }
    if (_calView == CalendarHomeView.week) {
      final days = calendarWeekDays(_calFocusDay);
      return _buildTimedCalendar(
        today: today,
        accent: accent,
        days: days,
        showDayHeaders: true,
      );
    }
    if (_calView == CalendarHomeView.three) {
      return _buildTimedCalendar(
        today: today,
        accent: accent,
        days: calendarThreeDays(_calFocusDay),
        showDayHeaders: true,
      );
    }
    if (_calView == CalendarHomeView.day) {
      return _buildTimedCalendar(
        today: today,
        accent: accent,
        days: [_calFocusDay],
        showDayHeaders: false,
      );
    }

    final rawEvents = _visibleCalendarItems.where((item) {
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
                                            color: colorForCalendarEvent(
                                              item,
                                              _calendars,
                                              accent,
                                            ),
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
    if (widget.product == SuiteProduct.calendar) {
      await _openEditor();
      return;
    }
    if (widget.product != SuiteProduct.notes &&
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
            if (widget.product == SuiteProduct.notes) ...[
              ListTile(
                leading: const Icon(Icons.sticky_note_2_outlined),
                title: const Text('Note'),
                onTap: () => Navigator.pop(ctx, 'note'),
              ),
              ListTile(
                leading: const Icon(Icons.checklist_outlined),
                title: const Text('Liste'),
                onTap: () => Navigator.pop(ctx, 'list'),
              ),
              ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: const Text('Rappel'),
                onTap: () => Navigator.pop(ctx, 'reminder'),
              ),
            ],
            if (widget.product == SuiteProduct.tasks)
              ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: const Text('Tâche'),
                onTap: () => Navigator.pop(ctx, 'task'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    final product = switch (choice) {
      'task' => SuiteProduct.tasks,
      'note' || 'list' || 'reminder' => SuiteProduct.notes,
      _ => widget.product,
    };
    final saved = await showSuiteProductEditor(
      context: context,
      product: product,
      api: _api,
      taskListId: _selectedTaskListId,
      noteAsChecklist: choice == 'list',
      seedRemind: choice == 'reminder'
          ? DateTime.now().add(const Duration(hours: 1))
          : null,
      noteLabels: product == SuiteProduct.notes ? _allNoteLabels : const [],
      noteInitialLabels: product == SuiteProduct.notes && _noteLabelFilter != null
          ? [_noteLabelFilter!]
          : const [],
      onNoteLabelCreated: product == SuiteProduct.notes ? _rememberNoteLabel : null,
    );
    if (saved && mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return SuiteDrawerScaffold(
      onConsumeBack: widget.product == SuiteProduct.contacts
          ? () {
              if (_selectedContactKeys.isEmpty) return false;
              setState(_selectedContactKeys.clear);
              return true;
            }
          : widget.product == SuiteProduct.tasks
          ? () {
              if (!tasksFilterBack(
                selectedListId: _selectedTaskListId,
                query: _contactQuery,
              )) {
                return false;
              }
              setState(() {
                _selectedTaskListId = null;
                _contactQuery = '';
              });
              return true;
            }
          : null,
      currentApp: widget.product.suiteApp,
      title: _showSettings
          ? 'Paramètres'
          : widget.product == SuiteProduct.notes
              ? _notesAppBarTitle()
              : widget.product == SuiteProduct.contacts
                  ? _contactsAppBarTitle()
                  : widget.product == SuiteProduct.calendar
                      ? ''
                      : widget.product.title,
      gatewayUrl: widget.gatewayBase,
      userEmail: widget.userEmail,
      showSettings: _showSettings,
      navItems: _productNavItems(),
      appBarActions: [
        if (!_showSettings && widget.product == SuiteProduct.calendar) ...[
          IconButton(
            tooltip: _calSearchOpen ? 'Fermer la recherche' : 'Rechercher',
            icon: Icon(_calSearchOpen ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _calSearchOpen = !_calSearchOpen;
              _calFabOpen = false;
              if (!_calSearchOpen) {
                _calQuery = '';
                _calSearchCtrl.clear();
              }
            }),
          ),
          _calendarTodayButton(),
        ],
        if (!_showSettings && widget.product == SuiteProduct.notes) ...[
          if (_notesSearchOpen)
            SizedBox(
              width: 180,
              child: TextField(
                autofocus: true,
                decoration: InputDecoration(
                  hintText: _notesShowArchived ? 'Archives' : 'Rechercher',
                  isDense: true,
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _contactQuery = v),
              ),
            ),
          IconButton(
            tooltip: _notesSearchOpen ? 'Fermer la recherche' : 'Rechercher',
            icon: Icon(_notesSearchOpen ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _notesSearchOpen = !_notesSearchOpen;
              if (!_notesSearchOpen) _contactQuery = '';
            }),
          ),
        ],
        if (!_showSettings &&
            widget.product != SuiteProduct.contacts &&
            widget.product != SuiteProduct.calendar)
          IconButton(icon: const Icon(Icons.refresh), onPressed: _reload),
      ],
      onAccountTap: () => setState(() => _showSettings = true),
      versionLabel: 'Hubera ${widget.product.title}',
      huberaProduct: widget.product.suiteApp.asHubera,
      showAppSwitcher: false,
      flushBottomBar: widget.product == SuiteProduct.contacts,
      showHuberaIdLink: widget.product != SuiteProduct.contacts &&
          widget.product != SuiteProduct.calendar &&
          widget.product != SuiteProduct.notes &&
          widget.product != SuiteProduct.tasks,
      showAccountSettings: widget.product != SuiteProduct.calendar,
      titleWidget: widget.product == SuiteProduct.calendar && !_showSettings
          ? (_calSearchOpen ? _calendarSearchField() : _calendarMonthTitle())
          : widget.product == SuiteProduct.contacts &&
              !_showSettings &&
              _contactShelf == ContactShelf.active &&
              _contactsNav != 'organize'
          ? TextField(
              controller: _contactSearchCtrl,
              decoration: const InputDecoration(
                hintText: 'Rechercher dans vos contacts',
                border: InputBorder.none,
                isDense: true,
              ),
              onChanged: (v) => setState(() => _contactQuery = v),
            )
          : null,
      bottomDestinations: widget.product == SuiteProduct.contacts
          ? const [
              HuberaNavDest(id: 'contacts', label: 'Contacts', icon: Icons.people_outline),
              HuberaNavDest(id: 'organize', label: 'Organiser', icon: Icons.tune),
            ]
          : const [],
      selectedBottomId: widget.product != SuiteProduct.contacts
          ? null
          : _contactShelf != ContactShelf.active || _contactsNav == 'organize'
              ? 'organize'
              : _contactsNav,
      onBottomSelected: widget.product == SuiteProduct.contacts
          ? (id) {
              setState(() {
                _contactsNav = id;
                _showSettings = false;
                if (id == 'contacts') {
                  _contactShelf = ContactShelf.active;
                  _selectedContactKeys.clear();
                } else if (id == 'organize') {
                  _contactShelf = ContactShelf.active;
                  _selectedContactKeys.clear();
                }
              });
            }
          : null,
      onOpenSettings: () => setState(() => _showSettings = true),
      onCloseSettings: () => setState(() => _showSettings = false),
      onLogout: widget.onLogout,
      settingsBody: SuiteSettingsPanel(
        gatewayUrl: widget.gatewayBase,
        appName: widget.product.title,
        webAppPath: widget.product.webPath,
        addressBook: widget.product == SuiteProduct.contacts,
        calendarOnly: widget.product == SuiteProduct.calendar,
        ownAppSettings: widget.product == SuiteProduct.notes ||
            widget.product == SuiteProduct.tasks,
        accountEmail: widget.userEmail ??
            ((widget.product == SuiteProduct.notes ||
                    widget.product == SuiteProduct.tasks)
                ? _emailFromAccess(widget.accessToken)
                : null),
        installedVersion:
            widget.product == SuiteProduct.tasks ? _installedVersion : null,
        onCheckUpdate: widget.product == SuiteProduct.calendar
            ? () => cloudityCheckUpdateManually(
                  context,
                  gatewayBase: widget.gatewayBase,
                  appSlug: widget.product.suiteApp.otaAppSlug,
                  appName: 'Hubera Calendar',
                  huberaHost: widget.product.suiteApp.huberaHost,
                )
            : widget.product == SuiteProduct.contacts
                ? _checkContactsUpdate
                : (widget.product == SuiteProduct.notes ||
                        widget.product == SuiteProduct.tasks)
                    ? _checkOwnAppUpdate
                    : null,
        onLogout: () => widget.onLogout(),
      ),
      floatingActionButton: _showSettings ||
              (widget.product == SuiteProduct.contacts &&
                  (_contactShelf != ContactShelf.active || _contactsNav == 'organize'))
          ? null
          : widget.product == SuiteProduct.calendar
              ? _calendarCreateFab()
              : FloatingActionButton(
              onPressed: widget.product == SuiteProduct.notes
                  ? _openNotesComposer
                  : _showCreateMenu,
              tooltip: widget.product == SuiteProduct.contacts ? 'Créer un contact' : 'Créer',
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
