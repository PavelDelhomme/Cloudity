import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'ingredient_photo.dart';
import 'mealdb.dart';

/// Traduction distante. Les tests la coupent : l’affichage reste le glossaire.
bool cookRemoteTranslation = true;

final Map<String, String> cookRemoteFrench = {};

/// Texte français tout de suite (correction apprise, sinon glossaire).
/// Le réseau ne part que si le glossaire n’a rien changé, et ne bloque pas la saisie.
Future<String> cookResolveFrench(String source) async {
  final raw = source.trim();
  if (raw.isEmpty) return raw;
  final learned = cookUserFixes[raw.toLowerCase()];
  if (learned != null && learned.isNotEmpty) return learned;
  final local = cookToFrench(raw);
  if (!cookRemoteTranslation) return local;
  if (local.toLowerCase() != raw.toLowerCase()) return local;
  final cached = cookRemoteFrench[raw.toLowerCase()];
  if (cached != null && cached.isNotEmpty) return cached;
  final remote = await cookFetchFrench(raw);
  if (remote == null || remote.trim().isEmpty) return local;
  if (cookUserFixes.containsKey(raw.toLowerCase())) {
    return cookUserFixes[raw.toLowerCase()]!;
  }
  final value = remote.trim();
  cookRemoteFrench[raw.toLowerCase()] = value;
  return value;
}

Future<String?> cookFetchFrench(String text, {http.Client? client}) async {
  final q = text.trim();
  if (q.length < 2 || q.length > 180) return null;
  final own = client == null;
  final httpClient = client ?? http.Client();
  try {
    final uri = Uri.parse(
      'https://translate.googleapis.com/translate_a/single'
      '?client=gtx&sl=auto&tl=fr&dt=t&q=${Uri.encodeQueryComponent(q)}',
    );
    final res = await httpClient
        .get(uri, headers: {'User-Agent': ingredientPhotoUserAgent})
        .timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return null;
    final decoded = jsonDecode(res.body);
    if (decoded is! List || decoded.isEmpty || decoded.first is! List) return null;
    final buf = StringBuffer();
    for (final part in decoded.first as List) {
      if (part is List && part.isNotEmpty && part.first is String) {
        buf.write(part.first);
      }
    }
    final out = buf.toString().trim();
    return out.isEmpty ? null : out;
  } catch (_) {
    return null;
  } finally {
    if (own) httpClient.close();
  }
}

class CookFrenchText extends StatefulWidget {
  const CookFrenchText({super.key, required this.source, this.style, this.maxLines});

  final String source;
  final TextStyle? style;
  final int? maxLines;

  @override
  State<CookFrenchText> createState() => _CookFrenchTextState();
}

class _CookFrenchTextState extends State<CookFrenchText> {
  String _shown = '';
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _shown = cookToFrenchLearned(widget.source.trim());
    cookFixesTick.addListener(_showNow);
    _kickRemote();
  }

  @override
  void didUpdateWidget(covariant CookFrenchText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.source != widget.source) _showNow();
  }

  @override
  void dispose() {
    cookFixesTick.removeListener(_showNow);
    super.dispose();
  }

  void _showNow() {
    final raw = widget.source.trim();
    final immediate = cookToFrenchLearned(raw);
    if (mounted) setState(() => _shown = immediate);
    _kickRemote();
  }

  void _kickRemote() {
    final raw = widget.source.trim();
    final gen = ++_gen;
    unawaited(() async {
      final next = await cookResolveFrench(raw);
      if (!mounted || gen != _gen) return;
      final learned = cookUserFixes[raw.toLowerCase()];
      final value = (learned != null && learned.isNotEmpty) ? learned : next;
      if (value != _shown) setState(() => _shown = value);
    }());
  }

  @override
  Widget build(BuildContext context) {
    return Text(
      _shown,
      style: widget.style,
      maxLines: widget.maxLines,
      overflow: widget.maxLines == null ? null : TextOverflow.ellipsis,
    );
  }
}

/// Petit indicateur sous un titre ou un ingrédient déjà traduit.
class CookFixHint extends StatelessWidget {
  const CookFixHint({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        style: TextButton.styleFrom(
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          minimumSize: const Size(0, 28),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        onPressed: onPressed,
        child: const Text('pas la bonne traduction', style: TextStyle(fontSize: 12)),
      ),
    );
  }
}
