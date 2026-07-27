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
    var token = accessToken;
    for (var attempt = 0; attempt < 2; attempt++) {
      final uri = Uri.parse('$_base$path');
      final res = await http
          .get(uri, headers: authHeaders(token))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode == 401 && onTokenRefresh != null && attempt == 0) {
        final refreshed = await onTokenRefresh!();
        if (refreshed != null && refreshed.isNotEmpty) {
          token = refreshed;
          accessToken = refreshed;
          continue;
        }
      }
      if (res.statusCode != 200) {
        throw SuiteApiException(
          'HTTP $path → ${res.statusCode}: ${res.body.isEmpty ? "erreur" : res.body}',
        );
      }
      final body = res.body.isEmpty ? '[]' : res.body;
      return jsonDecode(body);
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
