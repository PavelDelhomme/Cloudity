import 'package:flutter/material.dart';

import '../api/admin_api.dart';
import '../auth/user_session.dart';
import 'tenants_screen.dart';

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
  int _tenantCount = 0;
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
      await widget.session.refreshIfNeeded();
      final api = AdminApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      final tenants = await api.listTenants();
      if (!mounted) return;
      setState(() {
        _tenantCount = tenants.length;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Administration'),
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
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => TenantsScreen(session: widget.session),
              ),
            );
          }
        },
        children: const [
          DrawerHeader(
            child: Align(
              alignment: Alignment.bottomLeft,
              child: Text('Cloudity Admin', style: TextStyle(fontSize: 22)),
            ),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: Text('Tableau de bord'),
          ),
          NavigationDrawerDestination(
            icon: Icon(Icons.business_outlined),
            selectedIcon: Icon(Icons.business),
            label: Text('Tenants'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.business),
                      title: const Text('Tenants actifs'),
                      subtitle: Text('Gateway : ${widget.session.api.baseUrl}'),
                      trailing: Text('$_tenantCount', style: Theme.of(context).textTheme.headlineSmall),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Application mobile d’administration — MVP. Utilisez /4dm1n sur le web pour les opérations avancées.',
                  ),
                ],
              ),
            ),
    );
  }
}
