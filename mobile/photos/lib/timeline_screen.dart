import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'user_session.dart';

const _pageSize = 48;

const _monthsFr = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

String _dayKeyFromItem(Map<String, dynamic> o) {
  final iso = (o['updated_at'] ?? o['created_at'])?.toString() ?? '';
  if (iso.isEmpty) return 'unknown';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return 'unknown';
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String _headingForDayKey(String dayKey, String sampleIso) {
  if (dayKey == 'unknown') return 'Date inconnue';
  final d = DateTime.tryParse(sampleIso)?.toLocal();
  if (d == null) return dayKey;
  final now = DateTime.now();
  final t0 = DateTime(now.year, now.month, now.day);
  final t1 = DateTime(d.year, d.month, d.day);
  final diff = t0.difference(t1).inDays;
  if (diff == 0) return 'Aujourd’hui';
  if (diff == 1) return 'Hier';
  return '${d.day} ${_monthsFr[d.month - 1]} ${d.year}';
}

List<({String dayKey, String heading, List<Map<String, dynamic>> items})> _groupByDay(
  List<Map<String, dynamic>> flat,
) {
  final out = <({String dayKey, String heading, List<Map<String, dynamic>> items})>[];
  for (final o in flat) {
    final dk = _dayKeyFromItem(o);
    final iso = (o['updated_at'] ?? o['created_at'])?.toString() ?? '';
    if (out.isNotEmpty && out.last.dayKey == dk) {
      out.last.items.add(o);
    } else {
      out.add((dayKey: dk, heading: _headingForDayKey(dk, iso), items: [o]));
    }
  }
  return out;
}

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final UserSession session;
  final Future<void> Function() onLogout;

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  final List<Map<String, dynamic>> _items = [];
  int _offset = 0;
  bool _hasMore = true;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _loading = true;
      _offset = 0;
      _items.clear();
      _hasMore = true;
    });
    await _fetchPage(reset: true);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchPage({required bool reset}) async {
    try {
      await widget.session.refreshIfNeeded();
      final data = await widget.session.api.fetchTimelinePage(
        accessToken: widget.session.accessToken,
        limit: _pageSize,
        offset: reset ? 0 : _offset,
      );
      if (data['items'] is! List) {
        throw AuthException('Réponse timeline invalide');
      }
      final raw = (data['items'] as List).cast<dynamic>().map((e) => Map<String, dynamic>.from(e as Map)).toList();
      final more = data['has_more'] == true;
      if (!mounted) return;
      setState(() {
        if (reset) {
          _items
            ..clear()
            ..addAll(raw);
          _offset = raw.length;
        } else {
          _items.addAll(raw);
          _offset += raw.length;
        }
        _hasMore = more;
        _error = null;
      });
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final data = await widget.session.api.fetchTimelinePage(
            accessToken: widget.session.accessToken,
            limit: _pageSize,
            offset: reset ? 0 : _offset,
          );
          final raw =
              (data['items'] as List).cast<dynamic>().map((e) => Map<String, dynamic>.from(e as Map)).toList();
          if (!mounted) return;
          setState(() {
            if (reset) {
              _items
                ..clear()
                ..addAll(raw);
              _offset = raw.length;
            } else {
              _items.addAll(raw);
              _offset += raw.length;
            }
            _hasMore = data['has_more'] == true;
          });
          return;
        } catch (_) {
          if (mounted) setState(() => _error = 'Session expirée. Déconnectez-vous et reconnectez-vous.');
        }
      } else {
        if (mounted) setState(() => _error = e.message);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    await _fetchPage(reset: false);
    if (mounted) setState(() => _loadingMore = false);
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Effacer la session sur cet appareil ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Déconnecter')),
        ],
      ),
    );
    if (ok == true) await widget.onLogout();
  }

  String _thumbUrl(int id) =>
      '${widget.session.api.baseUrl}/drive/nodes/$id/content?inline=1';

  @override
  Widget build(BuildContext context) {
    final sections = _groupByDay(_items);
    return Scaffold(
      key: const ValueKey('cloudity_photos_timeline'),
      appBar: AppBar(
        title: const Text('Cloudity Photos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _reload,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _confirmLogout,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: _loading && _items.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null && _items.isEmpty
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
                        padding: const EdgeInsets.all(24),
                        children: const [
                          SizedBox(height: 80),
                          Text('Aucune image. Téléversez depuis le web ou le Drive.'),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                        itemCount: sections.length + (_hasMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index < sections.length) {
                            final sec = sections[index];
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
                                  child: Text(
                                    sec.heading,
                                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                          fontWeight: FontWeight.bold,
                                        ),
                                  ),
                                ),
                                GridView.builder(
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 3,
                                    crossAxisSpacing: 6,
                                    mainAxisSpacing: 6,
                                    childAspectRatio: 1,
                                  ),
                                  itemCount: sec.items.length,
                                  itemBuilder: (ctx, i) {
                                    final o = sec.items[i];
                                    final id = o['id'] as int?;
                                    if (id == null) return const SizedBox.shrink();
                                    return ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(
                                        _thumbUrl(id),
                                        fit: BoxFit.cover,
                                        headers: {
                                          'Authorization': 'Bearer ${widget.session.accessToken}',
                                        },
                                        loadingBuilder: (_, child, prog) {
                                          if (prog == null) return child;
                                          return const Center(
                                            child: SizedBox(
                                              width: 24,
                                              height: 24,
                                              child: CircularProgressIndicator(strokeWidth: 2),
                                            ),
                                          );
                                        },
                                        errorBuilder: (context, error, stackTrace) => ColoredBox(
                                          color: Colors.grey.shade300,
                                          child: Icon(Icons.broken_image_outlined, color: Colors.grey.shade600),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ],
                            );
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Center(
                              child: FilledButton.tonal(
                                onPressed: _loadingMore ? null : _loadMore,
                                child: _loadingMore
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : const Text('Charger plus'),
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
