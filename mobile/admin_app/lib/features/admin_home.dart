import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/admin_api.dart';
import '../auth/admin_refresh.dart';
import '../auth/user_session.dart';
import 'admin_account_settings.dart';
import 'admin_sections.dart';

class AdminHome extends StatefulWidget {
  const AdminHome({
    super.key,
    required this.session,
    required this.onLogout,
    this.loadOnStart = true,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  /// Défaut vrai. Les tests du clic compte le coupent pour ne pas joindre le réseau.
  final bool loadOnStart;

  @override
  State<AdminHome> createState() => _AdminHomeState();
}

class _AdminHomeState extends State<AdminHome> {
  String _section = 'home';
  bool _showAccount = false;
  bool _loading = true;
  bool _refreshRejected = false;
  String? _error;
  Map<String, dynamic> _stats = {};
  Map<String, dynamic> _fleet = {};
  Map<String, dynamic> _disk = {};
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _crashes = [];

  @override
  void initState() {
    super.initState();
    if (widget.loadOnStart) _load();
  }

  @override
  void didUpdateWidget(AdminHome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session.accessToken != widget.session.accessToken ||
        oldWidget.session.refreshToken != widget.session.refreshToken) {
      _refreshRejected = false;
      _load();
    }
  }

  AdminApi _api() => AdminApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );

  /// Compte ID déjà admin : ses réglages et ceux de l’app. Pas l’écran de connexion.
  void _openAccountSettings() {
    HuberaAccountSwitch.closeChooser();
    setState(() => _showAccount = true);
  }

  Future<void> _openAccountChooser() async {
    _refreshRejected = true;
    debugPrint(
      'Admin: refresh refusé, choix de compte (${widget.session.api.baseUrl})',
    );
    await SessionStore.clearLocalTokens();
    if (!mounted) return;
    HuberaAccountSwitch.requestChooser();
    setState(() {
      _loading = false;
      _error = null;
    });
  }

  Future<void> _load() async {
    if (_refreshRejected) {
      HuberaAccountSwitch.requestChooser();
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded().timeout(const Duration(seconds: 15));
      final api = _api();
      final stats = await api.fetchStats();
      final fleet = await api.fetchFleet();
      final disk = await api.fetchDisk();
      final users = await api.listUsers();
      final crashes = await api.listCrashes();
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _fleet = fleet;
        _disk = disk;
        _users = users;
        _crashes = crashes;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (adminRefreshTokenRejected(e)) {
        await _openAccountChooser();
        return;
      }
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = adminSectionLabels[_section] ?? 'Admin';
    final email = emailFromAccessToken(widget.session.accessToken) ?? '';
    return PopScope(
      canPop: !_showAccount,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || !_showAccount) return;
        setState(() => _showAccount = false);
      },
      child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: _showAccount
            ? IconButton(
                tooltip: 'Retour',
                onPressed: () => setState(() => _showAccount = false),
                icon: const Icon(Icons.arrow_back),
              )
            : null,
        title: _showAccount
            ? const Text('Compte')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title),
                  if (email.isNotEmpty)
                    Text(email, style: Theme.of(context).textTheme.labelSmall),
                ],
              ),
        actions: [
          if (!_showAccount)
            IconButton(
              tooltip: 'Compte',
              onPressed: _openAccountSettings,
              icon: const Icon(Icons.account_circle_outlined),
            ),
          IconButton(
            tooltip: 'Actualiser',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Déconnexion',
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: _showAccount
          ? AdminAccountSettings(
              gatewayUrl: widget.session.api.baseUrl,
              email: email,
            )
          : _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Theme.of(context).colorScheme.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(_error!),
                      ),
                    ),
                  ..._body(),
                ],
              ),
            ),
      bottomNavigationBar: _showAccount
          ? null
          : NavigationBar(
        selectedIndex: adminSectionIds.indexOf(_section).clamp(0, adminSectionIds.length - 1),
        onDestinationSelected: (i) => setState(() => _section = adminSectionIds[i]),
        destinations: [
          for (final id in adminSectionIds)
            NavigationDestination(
              icon: Icon(_icon(id)),
              label: adminSectionLabels[id] ?? id,
            ),
        ],
      ),
      ),
    );
  }

  IconData _icon(String id) {
    switch (id) {
      case 'apps':
        return Icons.phone_android;
      case 'users':
        return Icons.people_outline;
      case 'disk':
        return Icons.storage;
      case 'errors':
        return Icons.error_outline;
      default:
        return Icons.dashboard_outlined;
    }
  }

  List<Widget> _body() {
    switch (_section) {
      case 'apps':
        return _apps();
      case 'users':
        return _userList();
      case 'disk':
        return _diskList();
      case 'errors':
        return _errorList();
      default:
        return _overview();
    }
  }

  List<Widget> _overview() {
    final apps = _asMaps(_fleet['apps']);
    return [
      _stat('Utilisateurs', '${_stats['total_users'] ?? _users.length}'),
      _stat('Tenants actifs', '${_stats['active_tenants'] ?? '—'}'),
      _stat('Applications', '${apps.length}'),
      _stat('Erreurs remontées', '${_crashes.length}'),
      const SizedBox(height: 8),
      const Text('Les tâches, les rapports et le Gantt restent dans Hubera Docs.'),
    ];
  }

  List<Widget> _apps() {
    final apps = _asMaps(_fleet['apps']);
    if (apps.isEmpty) {
      return const [Text('Aucune application lue sur les flux.')];
    }
    return [
      for (final app in apps)
        ListTile(
          title: Text('${app['label'] ?? app['slug']} ${app['version'] ?? '—'}'),
          subtitle: Text(
            '${app['package'] ?? 'paquet inconnu'} · code ${app['versionCode'] ?? '—'}'
            '${app['canonicalFirst'] == true ? '' : ' · legacy en tête du flux'}',
          ),
        ),
    ];
  }

  List<Widget> _userList() {
    if (_users.isEmpty) return const [Text('Aucun utilisateur.')];
    return [
      for (final user in _users)
        ListTile(
          title: Text('${user['email'] ?? 'compte'}'),
          subtitle: Text('${user['role'] ?? 'user'} · tenant ${user['tenant_id'] ?? '—'}'),
        ),
    ];
  }

  List<Widget> _diskList() {
    final mounts = _asMaps(_disk['mounts']);
    if (mounts.isEmpty) return const [Text('Aucun disque lisible depuis le service.')];
    return [
      for (final mount in mounts)
        ListTile(
          title: Text('${mount['path']}'),
          subtitle: Text('${mount['usedPercent'] ?? '—'} % utilisé'),
        ),
    ];
  }

  List<Widget> _errorList() {
    if (_crashes.isEmpty) return const [Text('Aucune erreur remontée par les applications.')];
    return [
      for (final crash in _crashes)
        ListTile(
          title: Text('${crash['id'] ?? crash['filename'] ?? 'rapport'}'),
          subtitle: Text('${crash['modified'] ?? ''}'),
        ),
    ];
  }

  Widget _stat(String label, String value) {
    return Card(
      child: ListTile(
        title: Text(label),
        trailing: Text(value, style: Theme.of(context).textTheme.titleLarge),
      ),
    );
  }

  List<Map<String, dynamic>> _asMaps(Object? raw) {
    if (raw is! List) return [];
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
}
