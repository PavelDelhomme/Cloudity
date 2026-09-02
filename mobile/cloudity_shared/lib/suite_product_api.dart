import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'app_theme.dart';
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
              .timeout(const Duration(seconds: 15));
        case 'PUT':
          res = await http
              .put(uri, headers: headers, body: body)
              .timeout(const Duration(seconds: 15));
        case 'PATCH':
          res = await http
              .patch(uri, headers: headers, body: body)
              .timeout(const Duration(seconds: 15));
        case 'DELETE':
          res = await http
              .delete(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
        default:
          res = await http
              .get(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
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

  Future<List<Map<String, dynamic>>> fetchCalendarEvents() =>
      fetchJsonList('/calendar/events');

  Future<List<Map<String, dynamic>>> fetchContacts() =>
      fetchJsonList('/contacts');

  Future<List<Map<String, dynamic>>> fetchNotes() => fetchJsonList('/notes');

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
    String? remindAt,
    bool clearRemindAt = false,
    List<String>? labels,
  }) async {
    await _request(
      'PUT',
      '/notes/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (content != null) 'content': content,
        if (color != null) 'color': color,
        if (pinned != null) 'pinned': pinned,
        if (clearRemindAt) 'remind_at': '',
        if (!clearRemindAt && remindAt != null) 'remind_at': remindAt,
        if (labels != null) 'labels': labels,
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
      },
      ok: const {200, 204},
    );
  }

  Future<void> deleteCalendarEvent(int id) async {
    await _request('DELETE', '/calendar/events/$id', ok: const {200, 204});
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
  });

  final String gatewayUrl;
  final String appName;
  final String webAppPath;
  final List<Widget> extraSections;
  final VoidCallback? onLogout;
  final bool showThemeTile;

  @override
  Widget build(BuildContext context) {
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
            title: const Text('Hub Cloudity'),
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
}

// SuiteDrawerHeader → suite_drawer_scaffold.dart
