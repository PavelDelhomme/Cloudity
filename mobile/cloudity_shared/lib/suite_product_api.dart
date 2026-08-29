import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'app_theme.dart';
import 'http_helpers.dart';
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
  }) async {
    final data = await _request(
      'POST',
      '/notes',
      jsonBody: {'title': title, 'content': content},
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateNote({
    required int id,
    String? title,
    String? content,
  }) async {
    await _request(
      'PUT',
      '/notes/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (content != null) 'content': content,
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
  }) async {
    final data = await _request(
      'POST',
      '/contacts',
      jsonBody: {'name': name, 'email': email, 'phone': phone},
      ok: const {200, 201},
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> updateContact({
    required int id,
    String? name,
    String? email,
    String? phone,
  }) async {
    await _request(
      'PATCH',
      '/contacts/$id',
      jsonBody: {
        if (name != null) 'name': name,
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
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
  }) async {
    final data = await _request(
      'POST',
      '/tasks',
      jsonBody: {
        'title': title,
        if (listId != null) 'list_id': listId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
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
  }) async {
    await _request(
      'PUT',
      '/tasks/$id',
      jsonBody: {
        if (title != null) 'title': title,
        if (notes != null) 'notes': notes,
        if (completed != null) 'completed': completed,
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
  }) async {
    final data = await _request(
      'POST',
      '/calendar/events',
      jsonBody: {
        'title': title,
        'start_at': startAt,
        'end_at': endAt,
        if (location != null && location.isNotEmpty) 'location': location,
        if (description != null && description.isNotEmpty)
          'description': description,
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
    final webUrl = '$gatewayUrl$webAppPath';
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
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Paramètres suite'),
            subtitle: Text('$gatewayUrl/app/settings'),
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
