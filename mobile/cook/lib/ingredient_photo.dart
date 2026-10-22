import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'mealdb.dart';

const ingredientPhotoUserAgent =
    'HuberaCook/0.1.18 (https://cook.hubera.cloud; ingredient-photo)';

const _cacheKey = 'cook_ingredient_photo_v2';

/// « sel » part en « table salt », « savon » en « soap » : pas un homonyme du titre.
String cookPhotoQuery(String name) {
  final raw = name.trim().toLowerCase();
  const precise = <String, String>{
    'sel': 'table salt',
    'salt': 'table salt',
    'savon': 'soap',
    'éponge': 'sponge',
    'eponge': 'sponge',
    'éponges': 'sponge',
    'eponges': 'sponge',
    'lessive': 'laundry detergent',
  };
  final known = precise[raw];
  if (known != null) return known;
  final query = cookQueryToEnglish(name.trim());
  return query.isEmpty ? name.trim() : query;
}

/// Recherche Wikimedia Commons. Jamais Google.
Uri commonsIngredientSearchUri(String name) {
  return Uri.https('commons.wikimedia.org', '/w/api.php', {
    'action': 'query',
    'format': 'json',
    'origin': '*',
    'generator': 'search',
    'gsrsearch': name.trim(),
    'gsrnamespace': '6',
    'gsrlimit': '8',
    'prop': 'imageinfo',
    'iiprop': 'url|extmetadata',
    'iiurlwidth': '160',
  });
}

/// CC0, CC BY, CC BY-SA, domaine public, GFDL. Pas de NC ni de ND.
bool isOpenCommonsLicense(String? raw) {
  final s = (raw ?? '').toLowerCase().replaceAll('_', ' ');
  if (s.isEmpty) return false;
  if (s.contains('non-free') ||
      s.contains('nonfree') ||
      s.contains('all rights reserved') ||
      s.contains('fair use')) {
    return false;
  }
  if (RegExp(r'(^|[^a-z])nc([^a-z]|$)').hasMatch(s)) return false;
  if (RegExp(r'(^|[^a-z])nd([^a-z]|$)').hasMatch(s)) return false;
  if (s.contains('public domain') || s.contains('cc0') || s.contains('gfdl')) {
    return true;
  }
  return s.contains('cc-by') || s.contains('cc by');
}

bool _rasterUrl(String url) {
  final path = Uri.tryParse(url)?.path.toLowerCase() ?? url.toLowerCase();
  return path.endsWith('.jpg') ||
      path.endsWith('.jpeg') ||
      path.endsWith('.png') ||
      path.endsWith('.webp') ||
      path.contains('.jpg/') ||
      path.contains('.jpeg/') ||
      path.contains('.png/') ||
      path.contains('.webp/');
}

String? _licenseOf(Object? meta) {
  if (meta is! Map) return null;
  final short = meta['LicenseShortName'];
  if (short is Map && short['value'] != null) return short['value'].toString();
  if (short is String) return short;
  return null;
}

/// Première vignette ouverte dans l’ordre de la recherche. Un homonyme plus tard ne passe pas devant.
String? photoUrlFromCommonsJson(Object? body) {
  if (body is! Map) return null;
  final query = body['query'];
  if (query is! Map) return null;
  final pages = query['pages'];
  if (pages is! Map) return null;
  String? bestUrl;
  var bestIndex = 1 << 30;
  for (final page in pages.values) {
    if (page is! Map) continue;
    final info = page['imageinfo'];
    if (info is! List || info.isEmpty || info.first is! Map) continue;
    final ii = info.first as Map;
    if (!isOpenCommonsLicense(_licenseOf(ii['extmetadata']))) continue;
    final thumb = ii['thumburl']?.toString() ?? '';
    final full = ii['url']?.toString() ?? '';
    final url = thumb.isNotEmpty && _rasterUrl(thumb)
        ? thumb
        : (full.isNotEmpty && _rasterUrl(full) ? full : '');
    if (url.isEmpty) continue;
    final rawIndex = page['index'];
    final rank = rawIndex is int ? rawIndex : 1 << 20;
    if (rank < bestIndex) {
      bestIndex = rank;
      bestUrl = url;
    }
  }
  return bestUrl;
}

class IngredientPhotoCache {
  IngredientPhotoCache._();

  static final Map<String, String?> memory = {};
  static bool diskLoaded = false;

  static String keyOf(String name) => name.trim().toLowerCase();

  static void resetForTests() {
    memory.clear();
    diskLoaded = false;
  }

  static Future<void> ensureDisk() async {
    if (diskLoaded) return;
    diskLoaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      decoded.forEach((key, value) {
        final k = key.toString();
        if (memory.containsKey(k)) return;
        memory[k] = value is String && value.isNotEmpty ? value : null;
      });
    } catch (_) {}
  }

  static Future<void> remember(String name, String? url) async {
    final key = keyOf(name);
    if (key.length < 2) return;
    memory[key] = url;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(memory));
    } catch (_) {}
  }
}

Future<String?> fetchOpenIngredientPhoto(
  String name, {
  http.Client? client,
}) async {
  final query = cookPhotoQuery(name);
  if (query.length < 2) return null;
  final own = client == null;
  final httpClient = client ?? http.Client();
  try {
    final res = await httpClient
        .get(
          commonsIngredientSearchUri(query),
          headers: {
            'User-Agent': ingredientPhotoUserAgent,
            'Api-User-Agent': ingredientPhotoUserAgent,
          },
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return photoUrlFromCommonsJson(jsonDecode(res.body));
  } catch (_) {
    return null;
  } finally {
    if (own) httpClient.close();
  }
}

/// Pastille tout de suite. La photo libre arrive après, sans bloquer la frappe.
class IngredientPhoto extends StatefulWidget {
  const IngredientPhoto({super.key, required this.name, this.size = 40});

  final String name;
  final double size;

  @override
  State<IngredientPhoto> createState() => _IngredientPhotoState();
}

class _IngredientPhotoState extends State<IngredientPhoto> {
  String? _url;
  int _gen = 0;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _apply(widget.name, immediate: true);
  }

  @override
  void didUpdateWidget(covariant IngredientPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.name.trim() == widget.name.trim()) return;
    _apply(widget.name, immediate: false);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _apply(String name, {required bool immediate}) {
    _debounce?.cancel();
    final key = IngredientPhotoCache.keyOf(name);
    if (key.length < 2) {
      setState(() => _url = null);
      return;
    }
    if (IngredientPhotoCache.memory.containsKey(key)) {
      setState(() => _url = IngredientPhotoCache.memory[key]);
      return;
    }
    setState(() => _url = null);
    final wait = immediate ? Duration.zero : const Duration(milliseconds: 350);
    final gen = ++_gen;
    _debounce = Timer(wait, () => _resolve(name, gen));
  }

  Future<void> _resolve(String name, int gen) async {
    await IngredientPhotoCache.ensureDisk();
    if (!mounted || gen != _gen) return;
    final key = IngredientPhotoCache.keyOf(name);
    if (IngredientPhotoCache.memory.containsKey(key)) {
      setState(() => _url = IngredientPhotoCache.memory[key]);
      return;
    }
    final url = await fetchOpenIngredientPhoto(name);
    if (!mounted || gen != _gen) return;
    await IngredientPhotoCache.remember(name, url);
    if (!mounted || gen != _gen) return;
    setState(() => _url = url);
  }

  @override
  Widget build(BuildContext context) {
    final url = _url;
    final side = widget.size;
    final fallback = CircleAvatar(
      radius: side / 2,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Icon(Icons.restaurant_outlined, size: side * 0.5),
    );
    if (url == null || url.isEmpty) return fallback;
    return ClipOval(
      child: Image.network(
        url,
        width: side,
        height: side,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return fallback;
        },
      ),
    );
  }
}
