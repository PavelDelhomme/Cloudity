import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import 'app_theme.dart';
import 'calendar_drive.dart';
import 'http_helpers.dart';
import 'suite_drawer_scaffold.dart';
import 'suite_feedback_screen.dart';

/// Client HTTP minimal pour les apps suite (Calendar, Contacts, Notes, Tasks).
class SuiteProductApi {
  SuiteProductApi({
    required this.gatewayBase,
    required this.accessToken,
    this.onTokenRefresh,
  });

  final String gatewayBase;
  String accessToken;
  final Future<String?> Function()? onTokenRefresh;

  String get _base => gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  Future<List<Map<String, dynamic>>> fetchJsonList(String path) async {
    final data = await _getJson(path);
    if (data is List) {
      return data
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return [];
  }

  Future<dynamic> _getJson(String path) async {
    return _request('GET', path, ok: const {200});
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? jsonBody,
    required Set<int> ok,
  }) async {
    var token = accessToken;
    for (var attempt = 0; attempt < 2; attempt++) {
      final uri = Uri.parse('$_base$path');
      final headers = authHeaders(token, json: jsonBody != null);
      final body = jsonBody == null ? null : jsonEncode(jsonBody);
      late http.Response res;
      switch (method) {
        case 'POST':
          res = await http
              .post(uri, headers: headers, body: body)
              .timeout(const Duration(seconds: 20));
        case 'PUT':
          res = await http
              .put(uri, headers: headers, body: body)
              .timeout(const Duration(seconds: 20));
        case 'PATCH':
          res = await http
              .patch(uri, headers: headers, body: body)
              .timeout(const Duration(seconds: 20));
        case 'DELETE':
          res = await http
              .delete(uri, headers: headers)
              .timeout(const Duration(seconds: 20));
        default:
          res = await http
              .get(uri, headers: headers)
              .timeout(const Duration(seconds: 20));
      }
      if (res.statusCode == 401 && onTokenRefresh != null && attempt == 0) {
        final refreshed = await onTokenRefresh!();
        if (refreshed != null && refreshed.isNotEmpty) {
          token = refreshed;
          accessToken = refreshed;
          continue;
        }
      }
      if (!ok.contains(res.statusCode)) {
        throw SuiteApiException(
          'HTTP $method $path → ${res.statusCode}: ${res.body.isEmpty ? "erreur" : res.body}',
        );
      }
      if (res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }
    throw SuiteApiException('Non autorisé');
  }

  Future<List<Map<String, dynamic>>> fetchCalendars() =>
      fetchJsonList('/calendar/calendars');

  /// Drive du même jeton. Aucun secret inventé : si rien ne répond, Drive n’est pas relié.
  Future<({bool reachable, List<DriveFileRef> files})> probeHuberaDrive() async {
    final bases = <String>[_base];
    final uri = Uri.tryParse(_base);
    if (uri != null && uri.hasScheme && uri.host.isNotEmpty && uri.host != 'drive.hubera.cloud') {
      final drive = uri.replace(host: 'drive.hubera.cloud').removeFragment();
      final root = drive.replace(path: '', query: '').toString().replaceAll(RegExp(r'/$'), '');
      if (!bases.contains(root)) bases.add(root);
    }
    for (final base in bases) {
      try {
        final token = accessToken;
        final res = await http
            .get(Uri.parse('$base/drive/nodes'), headers: authHeaders(token, json: false))
            .timeout(const Duration(seconds: 8));
        if (res.statusCode == 401 && onTokenRefresh != null) {
          final refreshed = await onTokenRefresh!();
          if (refreshed != null && refreshed.isNotEmpty) {
            accessToken = refreshed;
            final again = await http
                .get(Uri.parse('$base/drive/nodes'), headers: authHeaders(refreshed, json: false))
                .timeout(const Duration(seconds: 8));
            if (again.statusCode == 200) {
              return (reachable: true, files: parseDriveFileList(jsonDecode(again.body)));
            }
          }
          continue;
        }
        if (res.statusCode == 200) {
          return (reachable: true, files: parseDriveFileList(jsonDecode(res.body)));
        }
      } catch (_) {}
    }
    return (reachable: false, files: const <DriveFileRef>[]);
  }

  Future<List<Map<String, dynamic>>> fetchCalendarEvents() =>
      fetchJsonList('/calendar/events');

  Future<List<Map<String, dynamic>>> fetchContacts() =>
      fetchJsonList('/contacts');

  Future<List<Map<String, dynamic>>> fetchNotes({bool archived = false}) {
    final q = archived ? '/notes?archived=1' : '/notes';
    return fetchJsonList(q);
  }

  Future<List<Map<String, dynamic>>> fetchTaskLists() =>
      fetchJsonList('/tasks/lists');

  Future<List<Map<String, dynamic>>> fetchTasks({int? listId}) {
    final path = listId != null ? '/tasks?list_id=$listId' : '/tasks';
    return fetchJsonList(path);
  }

  Future<Map<String, dynamic>> createNote({
    required String title,
    String content = '',
    String color = 'default',
    bool pinned = false,
    String? remindAt,
    List<String>? labels,
    Map<String, dynamic>? extras,
  }) async {
    final data = await _request(
      'POST',
      '/notes',
      jsonBody: {
        'title': title,
        'content': content,
        'color': color,
        'pinned': pinned,
        if (remindAt != null && remindAt.isNotEmpty) 'remind_at': remindAt,
        if (labels != null && labels.isNotEmpty) 'labels': labels,
        if (extras != null) 'extras': extras,
      },
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateNote({
    required int id,
    String? title,
    String? content,
    String? color,
    bool? pinned,
    bool? archived,
    String? remindAt,
    bool clearRemindAt = false,
    List<String>? labels,
    Map<String, dynamic>? extras,
  }) async {
    await _request(
      'PUT',
      '/notes/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (content != null) 'content': content,
        if (color != null) 'color': color,
        if (pinned != null) 'pinned': pinned,
        if (archived != null) 'archived': archived,
        if (clearRemindAt) 'remind_at': '',
        if (!clearRemindAt && remindAt != null) 'remind_at': remindAt,
        if (labels != null) 'labels': labels,
        if (extras != null) 'extras': extras,
      },
      ok: const {200, 204},
    );
  }

  Future<void> deleteNote(int id) async {
    await _request('DELETE', '/notes/$id', ok: const {200, 204});
  }

  Future<Map<String, dynamic>> createContact({
    required String name,
    String email = '',
    String phone = '',
    Map<String, dynamic>? profile,
  }) async {
    final data = await _request(
      'POST',
      '/contacts',
      jsonBody: {
        'name': name,
        'email': email,
        'phone': phone,
        if (profile != null) 'profile': profile,
      },
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateContact({
    required int id,
    String? name,
    String? email,
    String? phone,
    Map<String, dynamic>? profile,
  }) async {
    await _request(
      'PATCH',
      '/contacts/$id',
      jsonBody: {
        if (name != null) 'name': name,
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
        if (profile != null) 'profile': profile,
      },
      ok: const {200, 204},
    );
  }

  Future<void> deleteContact(int id) async {
    await _request('DELETE', '/contacts/$id', ok: const {200, 204});
  }

  Future<Map<String, dynamic>> createTask({
    required String title,
    int? listId,
    String? notes,
    String? startAt,
    String? dueAt,
    String? repeatRule,
    bool starred = false,
  }) async {
    final data = await _request(
      'POST',
      '/tasks',
      jsonBody: {
        'title': title,
        if (listId != null) 'list_id': listId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (startAt != null && startAt.isNotEmpty) 'start_at': startAt,
        if (dueAt != null && dueAt.isNotEmpty) 'due_at': dueAt,
        if (repeatRule != null && repeatRule.isNotEmpty) 'repeat_rule': repeatRule,
        'starred': starred,
      },
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateTask({
    required int id,
    String? title,
    String? notes,
    bool? completed,
    String? startAt,
    String? dueAt,
    bool clearStartAt = false,
    bool clearDueAt = false,
    String? repeatRule,
    bool clearRepeatRule = false,
    bool? starred,
  }) async {
    await _request(
      'PUT',
      '/tasks/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (notes != null) 'notes': notes,
        if (completed != null) 'completed': completed,
        if (clearStartAt) 'start_at': '',
        if (!clearStartAt && startAt != null) 'start_at': startAt,
        if (clearDueAt) 'due_at': '',
        if (!clearDueAt && dueAt != null) 'due_at': dueAt,
        if (clearRepeatRule) 'repeat_rule': '',
        if (!clearRepeatRule && repeatRule != null) 'repeat_rule': repeatRule,
        if (starred != null) 'starred': starred,
      },
      ok: const {200, 204},
    );
  }

  Future<void> deleteTask(int id) async {
    await _request('DELETE', '/tasks/$id', ok: const {200, 204});
  }

  Future<Map<String, dynamic>> createTaskList(String name) async {
    final data = await _request(
      'POST',
      '/tasks/lists',
      jsonBody: {'name': name},
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> createCalendarEvent({
    required String title,
    required String startAt,
    required String endAt,
    String? location,
    String? description,
    bool allDay = false,
    int? calendarId,
    String? repeatRule,
    List<String>? attendees,
    int? reminderMinutes,
    String? sourceKey,
    String? tripId,
    List<Map<String, dynamic>>? attachments,
  }) async {
    final data = await _request(
      'POST',
      '/calendar/events',
      jsonBody: {
        'title': title,
        'start_at': startAt,
        'end_at': endAt,
        'all_day': allDay,
        if (location != null && location.isNotEmpty) 'location': location,
        if (description != null && description.isNotEmpty)
          'description': description,
        if (calendarId != null) 'calendar_id': calendarId,
        if (repeatRule != null && repeatRule.isNotEmpty) 'repeat_rule': repeatRule,
        if (attendees != null) 'attendees': attendees,
        if (reminderMinutes != null) 'reminder_minutes': reminderMinutes,
        if (attachments != null) 'attachments': attachments,
        if (sourceKey != null && sourceKey.isNotEmpty) 'source_key': sourceKey,
        if (tripId != null && tripId.isNotEmpty) 'trip_id': tripId,
      },
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateCalendarEvent({
    required int id,
    String? title,
    String? startAt,
    String? endAt,
    String? location,
    String? description,
    bool? allDay,
    String? repeatRule,
    bool clearRepeatRule = false,
    List<String>? attendees,
    int? reminderMinutes,
    int? calendarId,
    List<Map<String, dynamic>>? attachments,
  }) async {
    await _request(
      'PUT',
      '/calendar/events/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (startAt != null) 'start_at': startAt,
        if (endAt != null) 'end_at': endAt,
        if (location != null) 'location': location,
        if (description != null) 'description': description,
        if (allDay != null) 'all_day': allDay,
        if (clearRepeatRule) 'repeat_rule': '',
        if (!clearRepeatRule && repeatRule != null) 'repeat_rule': repeatRule,
        if (attendees != null) 'attendees': attendees,
        if (reminderMinutes != null) 'reminder_minutes': reminderMinutes,
        if (calendarId != null) 'calendar_id': calendarId,
        if (attachments != null) 'attachments': attachments,
      },
      ok: const {200, 204},
    );
  }

  Future<void> deleteCalendarEvent(int id) async {
    await _request('DELETE', '/calendar/events/$id', ok: const {200, 204});
  }

  Future<Map<String, dynamic>> upsertFromMaps({
    required String tripId,
    required String title,
    required String startAt,
    String? endAt,
    String? location,
  }) async {
    final data = await _request(
      'POST',
      '/calendar/events/from-maps',
      jsonBody: {
        'trip_id': tripId,
        'title': title,
        'start_at': startAt,
        if (endAt != null && endAt.isNotEmpty) 'end_at': endAt,
        if (location != null && location.isNotEmpty) 'location': location,
      },
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> tryInviteEmails({
    required String title,
    required String whenLabel,
    String? location,
    required List<String> emails,
  }) async {
    if (emails.isEmpty) return;
    try {
      final raw = await _request('GET', '/mail/me/accounts', ok: const {200});
      final accounts = raw is List
          ? raw
          : (raw is Map ? (raw['accounts'] ?? raw['items'] ?? []) : []);
      if (accounts is! List || accounts.isEmpty) return;
      final first = accounts.first;
      final id = first is Map ? first['id'] : null;
      if (id == null) return;
      await _request(
        'POST',
        '/mail/me/send',
        jsonBody: {
          'account_id': id,
          'to': emails.join(', '),
          'subject': 'Invitation Hubera Calendar : $title',
          'body':
              '$title\n$whenLabel\n${location ?? ''}\n\nhttps://calendar.hubera.cloud/app/\n(Pas de Meet.)',
        },
        ok: const {200, 201, 202},
      );
    } catch (_) {
      /* invitations minimales */
    }
  }
}

class SuiteApiException implements Exception {
  SuiteApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Panneau paramètres suite réutilisable (gateway, liens web, déconnexion).
class SuiteSettingsPanel extends StatelessWidget {
  const SuiteSettingsPanel({
    super.key,
    required this.gatewayUrl,
    required this.appName,
    required this.webAppPath,
    this.extraSections = const [],
    this.onLogout,
    this.showThemeTile = true,
    this.addressBook = false,
    this.calendarOnly = false,
    this.ownAppSettings = false,
    this.onCheckUpdate,
    this.accountEmail,
    this.installedVersion,
  });

  final String gatewayUrl;
  final String appName;
  final String webAppPath;
  final List<Widget> extraSections;
  final VoidCallback? onLogout;
  final bool showThemeTile;

  /// Défaut faux : Mail, Agenda, Notes gardent les liens suite.
  /// Vrai : carnet seulement (compte, affichage, thème du téléphone).
  final bool addressBook;

  /// Défaut faux. Vrai : Agenda seulement — thème et mise à jour.
  /// Pas de second titre, pas de lien web, pas de Mail / Drive / Notes.
  final bool calendarOnly;

  /// Défaut faux : Mail, Photos, Pass et l’agenda gardent leurs liens.
  /// Vrai : réglages de cette app seulement (compte, affichage, mise à jour).
  /// Music, Fuel et Maps n’utilisent pas ce panneau : le défaut ne leur
  /// réintroduit aucun lien web ni liste d’apps.
  final bool ownAppSettings;

  /// Recherche manuelle. Défaut null : pas de bouton.
  final Future<void> Function()? onCheckUpdate;

  final String? accountEmail;

  /// Version installée. Défaut null : Notes et les autres apps ne l’affichent pas.
  /// Tasks la passe pour le même repère que Music (« installée … »).
  final String? installedVersion;

  @override
  Widget build(BuildContext context) {
    if (addressBook) return _addressBookSettings(context);
    if (calendarOnly) return _calendarSettings(context);
    if (ownAppSettings) return _ownAppSettings(context);
    final webUrl = '${suitePublicWebBase(gatewayUrl)}$webAppPath';
    final themeState = CloudityThemedAppScope.maybeOf(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Paramètres', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          '$appName · $gatewayUrl',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 20),
        if (showThemeTile && themeState != null)
          CloudityThemeModeTile(
            mode: themeState.themeMode,
            onChanged: themeState.setThemeMode,
          ),
        ...extraSections,
        Card(
          child: ListTile(
            leading: const Icon(Icons.bug_report_outlined),
            title: const Text('Signaler un problème'),
            subtitle: const Text('Envoie un rapport au back-office admin'),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => SuiteFeedbackScreen(screenName: appName),
                ),
              );
            },
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.open_in_browser),
            title: Text('Ouvrir $appName sur le web'),
            subtitle: Text(webUrl, maxLines: 2, overflow: TextOverflow.ellipsis),
            onTap: () async {
              await suiteLaunchWebPath(gatewayUrl, webAppPath);
            },
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Paramètres suite'),
            subtitle: Text('${suitePublicWebBase(gatewayUrl)}/app/settings'),
            onTap: () async {
              await suiteLaunchWebPath(gatewayUrl, '/app/settings');
            },
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.apps_outlined),
            title: const Text('Hubera'),
            subtitle: const Text('Mail, Drive, Agenda, Notes…'),
            onTap: () async {
              await suiteLaunchWebPath(gatewayUrl, '/app');
            },
          ),
        ),
        if (onLogout != null) ...[
          const SizedBox(height: 24),
          FilledButton.tonalIcon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout),
            label: const Text('Déconnexion'),
          ),
        ],
      ],
    );
  }

  Widget _addressBookSettings(BuildContext context) {
    final theme = Theme.of(context);
    final themeState = CloudityThemedAppScope.maybeOf(context);
    final account = accountEmail?.trim() ?? '';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Paramètres', style: theme.textTheme.titleLarge),
        if (onCheckUpdate != null) ...[
          const SizedBox(height: 12),
          Text('Application', style: theme.textTheme.titleSmall),
          const _InstalledVersionLine(),
          _UpdateCheckTile(onCheck: onCheckUpdate!),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 16),
        Text('Compte', style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.account_circle_outlined),
          title: Text(account.isEmpty ? 'Compte du téléphone' : account),
          subtitle: const Text('Compte utilisé pour les nouveaux contacts'),
        ),
        const SizedBox(height: 12),
        Text('Affichage', style: theme.textTheme.titleSmall),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Trier par'),
          subtitle: const Text('Prénom'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Format du nom'),
          subtitle: const Text('Prénom en premier'),
        ),
        if (showThemeTile && themeState != null)
          CloudityThemeModeTile(
            mode: themeState.themeMode,
            onChanged: themeState.setThemeMode,
          ),
        if (onLogout != null) ...[
          const SizedBox(height: 24),
          FilledButton.tonalIcon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout),
            label: const Text('Déconnexion'),
          ),
        ],
      ],
    );
  }

  /// Agenda seulement : version installée, thème, recherche manuelle.
  /// Pas de second « Paramètres », pas de lien web, pas d’autres apps.
  Widget _calendarSettings(BuildContext context) {
    final themeState = CloudityThemedAppScope.maybeOf(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        const _InstalledVersionLine(),
        if (showThemeTile && themeState != null)
          CloudityThemeModeTile(
            mode: themeState.themeMode,
            onChanged: themeState.setThemeMode,
          ),
        if (onCheckUpdate != null) _UpdateCheckTile(onCheck: onCheckUpdate!),
      ],
    );
  }

  /// Compte, affichage, réglages métier déjà fournis, recherche de mise à jour.
  /// Pas de « ouvrir sur le web », pas de lien vers une autre app.
  Widget _ownAppSettings(BuildContext context) {
    final theme = Theme.of(context);
    final themeState = CloudityThemedAppScope.maybeOf(context);
    final account = accountEmail?.trim() ?? '';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Paramètres', style: theme.textTheme.titleLarge),
        const SizedBox(height: 16),
        Text('Compte', style: theme.textTheme.titleSmall),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.account_circle_outlined),
          title: Text(account.isEmpty ? appName : account),
          subtitle: Text('Compte $appName'),
        ),
        const SizedBox(height: 12),
        Text('Affichage', style: theme.textTheme.titleSmall),
        if (showThemeTile && themeState != null)
          CloudityThemeModeTile(
            mode: themeState.themeMode,
            onChanged: themeState.setThemeMode,
          ),
        ...extraSections,
        const SizedBox(height: 12),
        Text('Application', style: theme.textTheme.titleSmall),
        if ((installedVersion ?? '').trim().isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.info_outline),
            title: Text('Version ${installedVersion!.trim()}'),
            subtitle: const Text(
              'Détection automatique au lancement. Proposée, jamais forcée.',
            ),
          ),
        if (onCheckUpdate != null) _UpdateCheckTile(onCheck: onCheckUpdate!),
        if (onLogout != null) ...[
          const SizedBox(height: 24),
          FilledButton.tonalIcon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout),
            label: const Text('Déconnexion'),
          ),
        ],
      ],
    );
  }
}

/// Ligne « Installée 0.1.13 · code 14 », comme le compte Music.
String huberaInstalledVersionLabel(String version, String code) {
  final v = version.trim();
  final c = code.trim();
  if (v.isEmpty) return '';
  if (c.isEmpty) return 'Installée $v';
  return 'Installée $v · code $c';
}

class _InstalledVersionLine extends StatefulWidget {
  const _InstalledVersionLine();

  @override
  State<_InstalledVersionLine> createState() => _InstalledVersionLineState();
}

class _InstalledVersionLineState extends State<_InstalledVersionLine> {
  String _label = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final label = huberaInstalledVersionLabel(info.version, info.buildNumber);
      if (!mounted || label.isEmpty) return;
      setState(() => _label = label);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_label.isEmpty) return const SizedBox.shrink();
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.info_outline),
      title: Text(_label),
      subtitle: const Text('Détection automatique. Proposée, jamais forcée.'),
    );
  }
}

class _UpdateCheckTile extends StatefulWidget {
  const _UpdateCheckTile({required this.onCheck});

  final Future<void> Function() onCheck;

  @override
  State<_UpdateCheckTile> createState() => _UpdateCheckTileState();
}

class _UpdateCheckTileState extends State<_UpdateCheckTile> {
  bool _busy = false;

  Future<void> _run() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onCheck();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: _busy
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.system_update_alt),
      title: const Text('Vérifier les mises à jour'),
      subtitle: const Text('En plus de la détection automatique. Proposée, jamais forcée.'),
      enabled: !_busy,
      onTap: _busy ? null : _run,
    );
  }
}

// SuiteDrawerHeader → suite_drawer_scaffold.dart
