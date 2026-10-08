import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/admin_api.dart';
import '../auth/user_session.dart';
import 'docs_screen.dart';
import 'tenants_screen.dart';

const _adminWebUrl = 'https://cloudity.delhomme.ovh/4dm1n';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  List<Map<String, dynamic>> _tenants = [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded().timeout(const Duration(seconds: 15));
      final api = AdminApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      final tenants = await api.listTenants();
      if (!mounted) return;
      setState(() {
        _tenants = tenants;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible d’ouvrir $url')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hubera Admin'),
        actions: [
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
      drawer: NavigationDrawer(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          Navigator.pop(context);
          if (index == 1) {
            openHuberaDocsApp(context);
          } else if (index == 2) {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => TenantsScreen(session: widget.session),
              ),
            );
          } else if (index == 3) {
            _open(_adminWebUrl);
          }
        },
        children: const [
          DrawerHeader(
            child: Align(
              alignment: Alignment.bottomLeft,
              child: Text('Hubera Admin', style: TextStyle(fontSize: 22)),
            ),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: Text('Tableau de bord'),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.checklist_outlined),
            selectedIcon: Icon(Icons.checklist),
            label: Text('Hubera Docs'),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.business_outlined),
            selectedIcon: Icon(Icons.business),
            label: Text('Tenants'),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.open_in_browser),
            selectedIcon: Icon(Icons.open_in_browser),
            label: Text('Console web'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Theme.of(context).colorScheme.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.onErrorContainer,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _load,
                              child: const Text('Réessayer'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.business),
                      title: const Text('Tenants actifs'),
                      subtitle: Text('Gateway : ${widget.session.api.baseUrl}'),
                      trailing: Text(
                        '${_tenants.length}',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => TenantsScreen(session: widget.session),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.checklist_outlined),
                      title: const Text('Hubera Docs'),
                      subtitle: const Text(
                        'Ouvre l’application native (kanban, PDF, retours) — pas le site.',
                      ),
                      trailing: const Icon(Icons.open_in_new),
                      onTap: () => openHuberaDocsApp(context),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.admin_panel_settings_outlined),
                      title: const Text('Console web'),
                      subtitle: const Text('Opérations avancées (/4dm1n).'),
                      trailing: const Icon(Icons.open_in_new),
                      onTap: () => _open(_adminWebUrl),
                    ),
                  ),
                  if (_tenants.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text('Aperçu tenants', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    ..._tenants.take(8).map((t) {
                      final name = t['name']?.toString() ?? 'Tenant ${t['id'] ?? ''}';
                      final slug = t['slug']?.toString() ?? '';
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.apartment_outlined),
                        title: Text(name),
                        subtitle: slug.isEmpty ? null : Text(slug),
                      );
                    }),
                  ],
                ],
              ),
            ),
    );
  }
}
