import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

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
  });

  final SuiteProduct product;
  final String gatewayBase;
  final String accessToken;
  final Future<String?> Function() refreshAccessToken;
  final Future<void> Function() onLogout;

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
  late SuiteProductApi _api;

  @override
  void initState() {
    super.initState();
    _api = SuiteProductApi(
      gatewayBase: widget.gatewayBase,
      accessToken: widget.accessToken,
      onTokenRefresh: widget.refreshAccessToken,
    );
    _reload();
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
        if (events.isNotEmpty) return events;
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
        return item['title']?.toString() ??
            item['name']?.toString() ??
            item['summary']?.toString() ??
            '(sans titre)';
      case SuiteProduct.contacts:
        final name = item['display_name']?.toString().trim();
        if (name != null && name.isNotEmpty) return name;
        final fn = item['first_name']?.toString() ?? '';
        final ln = item['last_name']?.toString() ?? '';
        final full = '$fn $ln'.trim();
        return full.isNotEmpty ? full : item['email']?.toString() ?? '(contact)';
      case SuiteProduct.notes:
        return item['title']?.toString() ?? '(sans titre)';
      case SuiteProduct.tasks:
        return item['title']?.toString() ?? '(tâche)';
    }
  }

  String? _itemSubtitle(Map<String, dynamic> item) {
    switch (widget.product) {
      case SuiteProduct.calendar:
        final start = item['start_at'] ?? item['starts_at'];
        return formatCloudityDateTimeLocal(start?.toString());
      case SuiteProduct.contacts:
        return item['email']?.toString() ?? item['phone']?.toString();
      case SuiteProduct.notes:
        final body = item['body']?.toString() ?? item['content']?.toString() ?? '';
        return body.length > 80 ? '${body.substring(0, 80)}…' : body;
      case SuiteProduct.tasks:
        final due = item['due_at'] ?? item['due_date'];
        if (due != null) return 'Échéance : ${formatCloudityDateTimeLocal(due.toString())}';
        return item['list_name']?.toString();
    }
  }

  Widget _buildDrawer() {
    return Drawer(
      child: SafeArea(
        child: ListView(
          children: [
            SuiteDrawerHeader(gatewayUrl: widget.gatewayBase),
            const Divider(),
            ListTile(
              leading: Icon(widget.product.icon),
              title: Text(widget.product.title),
              selected: !_showSettings,
              onTap: () {
                Navigator.pop(context);
                setState(() => _showSettings = false);
              },
            ),
            if (widget.product == SuiteProduct.tasks && _taskLists.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text('Listes'),
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
            const Divider(),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Paramètres'),
              selected: _showSettings,
              onTap: () {
                Navigator.pop(context);
                setState(() => _showSettings = true);
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Déconnexion'),
              onTap: () async {
                Navigator.pop(context);
                await widget.onLogout();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_showSettings ? 'Paramètres' : widget.product.title),
        actions: [
          if (!_showSettings)
            IconButton(icon: const Icon(Icons.refresh), onPressed: _reload),
        ],
      ),
      drawer: _buildDrawer(),
      body: _showSettings
          ? SuiteSettingsPanel(
              gatewayUrl: widget.gatewayBase,
              appName: widget.product.title,
              webAppPath: widget.product.webPath,
              onLogout: () => widget.onLogout(),
            )
          : RefreshIndicator(
              onRefresh: _reload,
              child: _loading
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(child: CircularProgressIndicator()),
                      ],
                    )
                  : _error != null
                      ? ListView(
                          padding: const EdgeInsets.all(24),
                          children: [
                            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                            const SizedBox(height: 16),
                            FilledButton(onPressed: _reload, child: const Text('Réessayer')),
                          ],
                        )
                      : _items.isEmpty
                          ? ListView(
                              children: [
                                const SizedBox(height: 80),
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.all(24),
                                    child: Text(
                                      'Aucun élément. Créez-en depuis le web ${widget.product.webPath}.',
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              itemCount: _items.length,
                              itemBuilder: (context, index) {
                                final item = _items[index];
                                final sub = _itemSubtitle(item);
                                return Card(
                                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                  child: ListTile(
                                    title: Text(_itemTitle(item), maxLines: 2, overflow: TextOverflow.ellipsis),
                                    subtitle: sub != null ? Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
                                  ),
                                );
                              },
                            ),
            ),
    );
  }
}
