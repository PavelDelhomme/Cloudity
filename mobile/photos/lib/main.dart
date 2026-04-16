import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const CloudityPhotosApp());
}

/// Base API : émulateur Android → `http://10.0.2.2:6080` ; appareil USB sur LAN → `http://<IP_PC>:6080`.
class CloudityPhotosApp extends StatelessWidget {
  const CloudityPhotosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cloudity Photos',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const TimelinePage(),
    );
  }
}

class TimelinePage extends StatefulWidget {
  const TimelinePage({super.key});

  @override
  State<TimelinePage> createState() => _TimelinePageState();
}

class _TimelinePageState extends State<TimelinePage> {
  final _baseCtrl = TextEditingController(text: 'http://10.0.2.2:6080');
  final _tokenCtrl = TextEditingController();
  String? _error;
  List<dynamic> _items = [];
  bool _loading = false;

  @override
  void dispose() {
    _baseCtrl.dispose();
    _tokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    final base = _baseCtrl.text.trim().replaceAll(RegExp(r'/$'), '');
    final token = _tokenCtrl.text.trim();
    if (token.isEmpty) {
      setState(() {
        _error = 'Collez un JWT (connexion web → stockage local / outil dev).';
        _loading = false;
      });
      return;
    }
    final uri = Uri.parse('$base/photos/timeline?limit=48&offset=0');
    try {
      final res = await http.get(
        uri,
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode != 200) {
        setState(() {
          _error = 'HTTP ${res.statusCode} : ${res.body.length > 200 ? res.body.substring(0, 200) : res.body}';
          _items = [];
          _loading = false;
        });
        return;
      }
      final map = jsonDecode(res.body) as Map<String, dynamic>;
      final items = map['items'] as List<dynamic>? ?? [];
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _items = [];
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cloudity Photos')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _baseCtrl,
              decoration: const InputDecoration(
                labelText: 'URL gateway',
                hintText: 'http://10.0.2.2:6080 ou http://192.168.x.x:6080',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.url,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _tokenCtrl,
              decoration: const InputDecoration(
                labelText: 'JWT (Bearer)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _loading ? null : _load,
              icon: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              label: Text(_loading ? 'Chargement…' : 'Charger la timeline'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            const Text('Images (drive_nodes)', style: TextStyle(fontWeight: FontWeight.bold)),
            Expanded(
              child: _items.isEmpty
                  ? Center(
                      child: Text(
                        _loading ? '' : 'Aucune image ou pas encore chargé.',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView.builder(
                      itemCount: _items.length,
                      itemBuilder: (context, i) {
                        final o = _items[i] as Map<String, dynamic>;
                        final name = o['name'] as String? ?? '?';
                        final id = o['id'];
                        return ListTile(
                          dense: true,
                          leading: const Icon(Icons.image_outlined),
                          title: Text(name),
                          subtitle: Text('id: $id'),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
