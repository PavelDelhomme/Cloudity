import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../auth/user_session.dart';
import '../features/tenants_screen.dart';
import 'docs_api.dart';
import 'markdown_view.dart';

const _apps = [
  'music', 'maps', 'fuel', 'docs', 'admin', 'pass', 'drive', 'mail',
  'contacts', 'photos', 'calendar', 'cook', 'jobs', 'id', 'ops', 'platform',
];

class DocsCockpit extends StatefulWidget {
  const DocsCockpit({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<DocsCockpit> createState() => _DocsCockpitState();
}

class _DocsCockpitState extends State<DocsCockpit> {
  final _docs = DocsApi();
  String _tab = 'home';
  String? _nestedTitle;
  VoidCallback? _nestedBack;
  bool _ready = false;
  String? _error;
  String _email = '';
  bool _fabOpen = false;
  String? _inboxKind;

  static const _titles = {
    'home': 'Docs',
    'kanban': 'Tâches',
    'docs': 'Docs',
    'pdf': 'Rapports',
    'inbox': 'Retours',
    'gantt': 'Avance',
    'account': 'Compte',
  };

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await widget.session.refreshIfNeeded();
      _email = await _docs.loginSso(widget.session.accessToken);
      if (!mounted) return;
      setState(() {
        _ready = true;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _ready = true;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _go(String id, {String? inboxKind}) {
    setState(() {
      _tab = id;
      _nestedTitle = null;
      _nestedBack = null;
      _fabOpen = false;
      if (id == 'inbox' && inboxKind != null) _inboxKind = inboxKind;
      if (id != 'inbox') _inboxKind = null;
    });
  }

  void _setNested(String? title, VoidCallback? back) {
    setState(() {
      _nestedTitle = title;
      _nestedBack = back;
    });
  }

  @override
  Widget build(BuildContext context) {
    final nested = _nestedBack != null;
    return Scaffold(
      drawer: nested || _tab == 'account'
          ? null
          : NavigationDrawer(
              selectedIndex: _drawerIndex(_tab),
              onDestinationSelected: (i) {
                Navigator.pop(context);
                if (i == 0) {
                  _go('home');
                } else if (i == 1) {
                  _go('kanban');
                } else if (i == 2) {
                  _go('docs');
                } else if (i == 3) {
                  _go('pdf');
                } else if (i == 4) {
                  _go('inbox');
                } else if (i == 5) {
                  _go('gantt');
                } else if (i == 6) {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => TenantsScreen(session: widget.session),
                    ),
                  );
                } else if (i == 7) {
                  launchUrl(
                    Uri.parse('https://cloudity.delhomme.ovh/4dm1n'),
                    mode: LaunchMode.externalApplication,
                  );
                }
              },
              children: const [
                Padding(
                  padding: EdgeInsets.fromLTRB(16, 24, 16, 8),
                  child: Text('Hubera Admin', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                ),
                NavigationDrawerDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: Text('Accueil')),
                NavigationDrawerDestination(icon: Icon(Icons.view_kanban_outlined), selectedIcon: Icon(Icons.view_kanban), label: Text('Tâches')),
                NavigationDrawerDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: Text('Docs')),
                NavigationDrawerDestination(icon: Icon(Icons.picture_as_pdf_outlined), selectedIcon: Icon(Icons.picture_as_pdf), label: Text('Rapports')),
                NavigationDrawerDestination(icon: Icon(Icons.feedback_outlined), selectedIcon: Icon(Icons.feedback), label: Text('Retours')),
                NavigationDrawerDestination(icon: Icon(Icons.timeline_outlined), selectedIcon: Icon(Icons.timeline), label: Text('Gantt')),
                NavigationDrawerDestination(icon: Icon(Icons.business_outlined), selectedIcon: Icon(Icons.business), label: Text('Tenants')),
                NavigationDrawerDestination(icon: Icon(Icons.open_in_browser), selectedIcon: Icon(Icons.open_in_browser), label: Text('Console web')),
              ],
            ),
      appBar: AppBar(
        leading: nested || _tab == 'account'
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  if (_nestedBack != null) {
                    _nestedBack!();
                  } else {
                    _go('home');
                  }
                },
              )
            : null,
        title: Text(_nestedTitle ?? _titles[_tab] ?? 'Admin'),
        actions: [
          if (_tab != 'account' && !nested)
            IconButton(
              tooltip: 'Compte',
              onPressed: () => _go('account'),
              icon: const Icon(Icons.account_circle_outlined),
            ),
        ],
      ),
      body: !_ready
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _docs.token == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: _boot, child: const Text('Réessayer SSO Docs')),
                      ],
                    ),
                  ),
                )
              : _body(),
      bottomNavigationBar: nested || _tab == 'account'
          ? null
          : NavigationBar(
              selectedIndex: _navIndex(_tab),
              onDestinationSelected: (i) {
                _go(const ['home', 'kanban', 'docs', 'pdf'][i]);
              },
              destinations: const [
                NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Accueil'),
                NavigationDestination(icon: Icon(Icons.view_kanban_outlined), selectedIcon: Icon(Icons.view_kanban), label: 'Tâches'),
                NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Docs'),
                NavigationDestination(icon: Icon(Icons.picture_as_pdf_outlined), selectedIcon: Icon(Icons.picture_as_pdf), label: 'Rapports'),
              ],
            ),
      floatingActionButton: nested || _tab == 'account' || _docs.token == null
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (_fabOpen) ...[
                  _fabItem('Tâche', Icons.assignment_outlined, () async {
                    _go('kanban');
                    await _KanbanScreen.openNew(context, _docs);
                  }),
                  _fabItem('Retour', Icons.feedback_outlined, () => _go('inbox', inboxKind: 'retour')),
                  _fabItem('Note', Icons.note_outlined, () => _go('inbox', inboxKind: 'note')),
                  const SizedBox(height: 8),
                ],
                FloatingActionButton(
                  onPressed: () => setState(() => _fabOpen = !_fabOpen),
                  child: Icon(_fabOpen ? Icons.close : Icons.add),
                ),
              ],
            ),
    );
  }

  Widget _fabItem(String label, IconData icon, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: FloatingActionButton.extended(
        heroTag: label,
        onPressed: () {
          setState(() => _fabOpen = false);
          onTap();
        },
        icon: Icon(icon),
        label: Text(label),
      ),
    );
  }

  int _navIndex(String tab) => switch (tab) {
        'kanban' => 1,
        'docs' => 2,
        'pdf' => 3,
        _ => 0,
      };

  int _drawerIndex(String tab) => switch (tab) {
        'kanban' => 1,
        'docs' => 2,
        'pdf' => 3,
        'inbox' => 4,
        'gantt' => 5,
        _ => 0,
      };

  Widget _body() {
    switch (_tab) {
      case 'kanban':
        return _KanbanScreen(api: _docs);
      case 'docs':
        return _FilesScreen(api: _docs, onNested: _setNested);
      case 'pdf':
        return _ReportsScreen(api: _docs, onNested: _setNested);
      case 'inbox':
        return _InboxScreen(api: _docs, initialKind: _inboxKind);
      case 'gantt':
        return _GanttScreen(api: _docs);
      case 'account':
        return _AccountScreen(email: _email, onLogout: widget.onLogout);
      default:
        return _HomeScreen(api: _docs, onGo: _go);
    }
  }
}

class _HomeScreen extends StatefulWidget {
  const _HomeScreen({required this.api, required this.onGo});
  final DocsApi api;
  final void Function(String) onGo;

  @override
  State<_HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<_HomeScreen> {
  Map<String, dynamic>? _d;
  String? _err;

  @override
  void initState() {
    super.initState();
    widget.api.dashboard().then((d) {
      if (mounted) setState(() => _d = d);
    }).catchError((e) {
      if (mounted) setState(() => _err = e.toString());
    });
  }

  int _count(String id) {
    final cols = (_d?['byCol'] as List?) ?? const [];
    for (final c in cols) {
      if (c is Map && c['column_id'] == id) return (c['c'] as num?)?.toInt() ?? 0;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    if (_err != null) return Center(child: Text(_err!));
    if (_d == null) return const Center(child: CircularProgressIndicator());
    final reports = (_d?['recentReports'] as List?) ?? const [];
    final tasks = (_d?['recentTasks'] as List?) ?? const [];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_d?['subtitle']?.toString() ?? 'Cockpit — tâches, docs, rapports, retours.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 12),
        Row(
          children: [
            _stat('À faire', _count('todo'), () => widget.onGo('kanban')),
            _stat('En cours', _count('doing'), () => widget.onGo('kanban')),
            _stat('Faits', _count('done'), () => widget.onGo('kanban')),
          ],
        ),
        const SizedBox(height: 16),
        Text('Rapports', style: Theme.of(context).textTheme.titleMedium),
        for (final r in reports)
          ListTile(
            title: Text(r['title']?.toString() ?? ''),
            subtitle: Text(r['summary']?.toString() ?? ''),
            onTap: () => widget.onGo('pdf'),
          ),
        Text('Tâches', style: Theme.of(context).textTheme.titleMedium),
        for (final t in tasks)
          ListTile(
            dense: true,
            title: Text(t['title']?.toString() ?? ''),
            subtitle: Text(t['project']?.toString() ?? ''),
            onTap: () => widget.onGo('kanban'),
          ),
      ],
    );
  }

  Widget _stat(String label, int n, VoidCallback onTap) {
    return Expanded(
      child: Card(
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Text('$n', style: Theme.of(context).textTheme.headlineSmall),
                Text(label),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _KanbanScreen extends StatefulWidget {
  const _KanbanScreen({required this.api});
  final DocsApi api;

  static Future<void> openNew(BuildContext context, DocsApi api) async {
    final title = TextEditingController();
    final body = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nouvelle tâche'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: title, decoration: const InputDecoration(labelText: 'Titre')),
            TextField(controller: body, decoration: const InputDecoration(labelText: 'Détail'), minLines: 2, maxLines: 4),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Créer')),
        ],
      ),
    );
    if (ok == true && title.text.trim().isNotEmpty) {
      await api.createTask(title: title.text.trim(), body: body.text);
    }
  }

  @override
  State<_KanbanScreen> createState() => _KanbanScreenState();
}

class _KanbanScreenState extends State<_KanbanScreen> {
  List<dynamic> _tasks = [];
  List<dynamic> _cols = [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final t = await widget.api.tasks();
    final c = await widget.api.columns();
    if (!mounted) return;
    setState(() {
      _tasks = t;
      _cols = c;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        for (final col in _cols) ...[
          Text((col['label'] ?? col['id']).toString().toUpperCase(),
              style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.primary)),
          for (final t in _tasks.where((x) => x['column_id'] == col['id']))
            Card(
              child: ListTile(
                title: Text(t['title']?.toString() ?? ''),
                subtitle: Text('${t['project'] ?? ''} · ${t['category'] ?? ''}'),
                onTap: () => _edit(t),
              ),
            ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Future<void> _edit(dynamic t) async {
    final title = TextEditingController(text: t['title']?.toString() ?? '');
    final body = TextEditingController(text: t['body']?.toString() ?? '');
    var col = t['column_id']?.toString() ?? 'todo';
    var proj = t['project']?.toString() ?? 'docs';
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 16, right: 16, top: 16),
        child: StatefulBuilder(
          builder: (ctx, setS) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Modifier la carte', style: Theme.of(ctx).textTheme.titleMedium),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Titre')),
                TextField(controller: body, decoration: const InputDecoration(labelText: 'Détail'), minLines: 3, maxLines: 6),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final c in _cols)
                      ChoiceChip(
                        label: Text(c['label']?.toString() ?? ''),
                        selected: col == c['id'],
                        onSelected: (_) => setS(() => col = c['id'].toString()),
                      ),
                  ],
                ),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final p in _apps)
                      ChoiceChip(
                        label: Text(p),
                        selected: proj == p,
                        onSelected: (_) => setS(() => proj = p),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Enregistrer'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok == true) {
      await widget.api.patchTask(t['id'].toString(), {
        'title': title.text,
        'body': body.text,
        'column_id': col,
        'project': proj,
      });
      await _reload();
    }
  }
}

class _FilesScreen extends StatefulWidget {
  const _FilesScreen({required this.api, required this.onNested});
  final DocsApi api;
  final void Function(String?, VoidCallback?) onNested;

  @override
  State<_FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<_FilesScreen> {
  List<dynamic> _files = [];
  String? _path;
  String _md = '';
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    widget.api.docs().then((f) {
      if (mounted) setState(() => _files = f);
    });
  }

  void _close() {
    setState(() {
      _path = null;
      _md = '';
      _editing = false;
    });
    widget.onNested(null, null);
  }

  @override
  Widget build(BuildContext context) {
    if (_path == null) {
      return ListView(
        padding: const EdgeInsets.all(12),
        children: [
          for (final f in _files)
            ListTile(
              title: Text(f['path']?.toString() ?? ''),
              onTap: () async {
                final p = f['path'].toString();
                final md = await widget.api.docFile(p);
                if (!mounted) return;
                setState(() {
                  _path = p;
                  _md = md;
                  _editing = false;
                });
                widget.onNested(p, _close);
              },
            ),
        ],
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              FilterChip(label: const Text('Aperçu'), selected: !_editing, onSelected: (_) => setState(() => _editing = false)),
              const SizedBox(width: 8),
              FilterChip(label: const Text('Modifier'), selected: _editing, onSelected: (_) => setState(() => _editing = true)),
            ],
          ),
        ),
        Expanded(
          child: _editing
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: TextField(
                    controller: TextEditingController(text: _md)..selection = TextSelection.collapsed(offset: _md.length),
                    maxLines: null,
                    expands: true,
                    onChanged: (v) => _md = v,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: MarkdownView(_md),
                ),
        ),
        if (_editing)
          Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton(
              onPressed: () async {
                await widget.api.saveDoc(_path!, _md);
                if (mounted) setState(() => _editing = false);
              },
              child: const Text('Enregistrer'),
            ),
          ),
      ],
    );
  }
}

class _ReportsScreen extends StatefulWidget {
  const _ReportsScreen({required this.api, required this.onNested});
  final DocsApi api;
  final void Function(String?, VoidCallback?) onNested;

  @override
  State<_ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<_ReportsScreen> {
  static const _pdf = MethodChannel('hubera/pdf');
  List<dynamic> _reports = [];
  Map<String, dynamic>? _open;
  String? _md;
  List<String> _pages = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    widget.api.reports().then((r) {
      if (mounted) setState(() => _reports = r);
    });
  }

  void _close() {
    setState(() {
      _open = null;
      _md = null;
      _pages = [];
    });
    widget.onNested(null, null);
  }

  Future<void> _openReport(Map<String, dynamic> r) async {
    setState(() {
      _open = r;
      _md = null;
      _pages = [];
      _loading = true;
    });
    widget.onNested(r['title']?.toString() ?? 'Rapport', _close);
    try {
      final name = r['filename']?.toString() ?? '';
      final bytes = await widget.api.reportBytes(name);
      if (name.toLowerCase().endsWith('.md') || r['kind'] == 'md') {
        if (!mounted) return;
        setState(() {
          _md = utf8.decode(bytes);
          _loading = false;
        });
        return;
      }
      final f = await widget.api.saveTemp(name.replaceAll('/', '_'), bytes);
      final pages = await _pdf.invokeMethod<List<dynamic>>('render', {'path': f.path});
      if (!mounted) return;
      setState(() {
        _pages = (pages ?? const []).map((e) => e.toString()).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _md = 'Impossible d’ouvrir ce fichier.\n$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_open == null) {
      return ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Text('Markdown rendu visuellement. PDF en pages.', style: Theme.of(context).textTheme.bodySmall),
          for (final r in _reports)
            Card(
              child: ListTile(
                title: Text(r['title']?.toString() ?? ''),
                subtitle: Text('${r['filename'] ?? ''}\n${r['summary'] ?? ''}'),
                isThreeLine: true,
                onTap: () => _openReport(Map<String, dynamic>.from(r as Map)),
              ),
            ),
        ],
      );
    }
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_md != null) {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: MarkdownView(_md!),
      );
    }
    return ListView(
      children: [
        for (final p in _pages)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Image.file(File(p)),
          ),
      ],
    );
  }
}

class _InboxScreen extends StatefulWidget {
  const _InboxScreen({required this.api, this.initialKind});
  final DocsApi api;
  final String? initialKind;

  @override
  State<_InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<_InboxScreen> {
  List<dynamic> _remarks = [];
  String _app = 'docs';
  late String _kind;
  String _filter = 'all';
  final _body = TextEditingController();

  @override
  void initState() {
    super.initState();
    _kind = widget.initialKind == 'note' ? 'note' : 'retour';
    _reload();
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final r = await widget.api.remarks();
    if (mounted) setState(() => _remarks = r);
  }

  @override
  Widget build(BuildContext context) {
    final shown = _remarks.where((r) => _filter == 'all' || r['kind'] == _filter);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Tape un retour pour changer le texte, le type ou l’application.',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          children: [
            for (final p in _apps)
              ChoiceChip(label: Text(p), selected: _app == p, onSelected: (_) => setState(() => _app = p)),
          ],
        ),
        Row(
          children: [
            ChoiceChip(label: const Text('Retour'), selected: _kind == 'retour', onSelected: (_) => setState(() => _kind = 'retour')),
            const SizedBox(width: 8),
            ChoiceChip(label: const Text('Note'), selected: _kind == 'note', onSelected: (_) => setState(() => _kind = 'note')),
          ],
        ),
        TextField(controller: _body, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'Ce qui cloche')),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () async {
            if (_body.text.trim().isEmpty) return;
            await widget.api.addRemark(app: _app, body: _body.text.trim(), kind: _kind);
            _body.clear();
            await _reload();
          },
          child: const Text('Enregistrer → tâche'),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          children: [
            ChoiceChip(label: const Text('Tous'), selected: _filter == 'all', onSelected: (_) => setState(() => _filter = 'all')),
            ChoiceChip(label: const Text('Retours'), selected: _filter == 'retour', onSelected: (_) => setState(() => _filter = 'retour')),
            ChoiceChip(label: const Text('Notes'), selected: _filter == 'note', onSelected: (_) => setState(() => _filter = 'note')),
          ],
        ),
        for (final r in shown)
          Card(
            child: ListTile(
              title: Text('${r['app']} · ${r['kind']}'),
              subtitle: Text(r['body']?.toString() ?? ''),
              onTap: () => _edit(r),
            ),
          ),
      ],
    );
  }

  Future<void> _edit(dynamic r) async {
    var app = r['app']?.toString() ?? 'docs';
    var kind = r['kind']?.toString() == 'note' ? 'note' : 'retour';
    final body = TextEditingController(text: r['body']?.toString() ?? '');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 16, right: 16, top: 16),
        child: StatefulBuilder(
          builder: (ctx, setS) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Modifier', style: Theme.of(ctx).textTheme.titleMedium),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final p in _apps)
                      ChoiceChip(label: Text(p), selected: app == p, onSelected: (_) => setS(() => app = p)),
                  ],
                ),
                Row(
                  children: [
                    ChoiceChip(label: const Text('Retour'), selected: kind == 'retour', onSelected: (_) => setS(() => kind = 'retour')),
                    const SizedBox(width: 8),
                    ChoiceChip(label: const Text('Note'), selected: kind == 'note', onSelected: (_) => setS(() => kind = 'note')),
                  ],
                ),
                TextField(controller: body, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'Texte')),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Enregistrer')),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok == true && body.text.trim().isNotEmpty) {
      await widget.api.patchRemark(r['id'].toString(), app: app, body: body.text.trim(), kind: kind);
      await _reload();
    }
  }
}

class _GanttScreen extends StatefulWidget {
  const _GanttScreen({required this.api});
  final DocsApi api;
  @override
  State<_GanttScreen> createState() => _GanttScreenState();
}

class _GanttScreenState extends State<_GanttScreen> {
  Map<String, dynamic>? _g;
  @override
  void initState() {
    super.initState();
    widget.api.gantt().then((g) {
      if (mounted) setState(() => _g = g);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_g == null) return const Center(child: CircularProgressIndicator());
    final bars = (_g?['bars'] as List?) ?? const [];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_g?['objective']?.toString() ?? ''),
        const SizedBox(height: 12),
        for (final b in bars)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${b['label']} · ${b['pct']}%', style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: ((b['pct'] as num?)?.toDouble() ?? 0) / 100),
                  Text('${b['start']} → ${b['end']}'),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _AccountScreen extends StatelessWidget {
  const _AccountScreen({required this.email, required this.onLogout});
  final String email;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(email.isEmpty ? 'Connecté' : email, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        const Text('Mise à jour jamais forcée. Hubera Docs vit ici, dans Admin — kanban, docs, rapports, retours, Gantt.'),
        const SizedBox(height: 16),
        TextButton.icon(
          onPressed: onLogout,
          icon: const Icon(Icons.logout),
          label: const Text('Quitter'),
        ),
      ],
    );
  }
}
