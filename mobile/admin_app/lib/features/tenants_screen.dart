import 'package:flutter/material.dart';

import '../api/admin_api.dart';
import '../auth/user_session.dart';

class TenantsScreen extends StatefulWidget {
  const TenantsScreen({super.key, required this.session});

  final UserSession session;

  @override
  State<TenantsScreen> createState() => _TenantsScreenState();
}

class _TenantsScreenState extends State<TenantsScreen> {
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
      await widget.session.refreshIfNeeded();
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
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tenants'),
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView.separated(
                  itemCount: _tenants.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final t = _tenants[index];
                    final name = t['name']?.toString() ?? 'Tenant ${t['id'] ?? index + 1}';
                    final slug = t['slug']?.toString() ?? '';
                    return ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.business)),
                      title: Text(name),
                      subtitle: Text(slug.isEmpty ? 'id=${t['id']}' : slug),
                    );
                  },
                ),
    );
  }
}
