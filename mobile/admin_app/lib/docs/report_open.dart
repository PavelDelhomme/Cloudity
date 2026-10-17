/// Nom de la note markdown qui porte le même rapport qu’un PDF / HTML.
///
/// `Hubera-2026-10-16-nuit.pdf` → `2026-10-16-nuit.md` quand ce fichier est listé.
String? companionNoteName(String filename, Iterable<String> names) {
  final clean = filename.trim();
  if (clean.isEmpty) return null;
  if (clean.toLowerCase().endsWith('.md')) return clean;

  final list = names.map((n) => n.trim()).where((n) => n.isNotEmpty).toList();
  final stem = clean.replaceAll(RegExp(r'\.(pdf|html)$', caseSensitive: false), '');
  final bare = stem.replaceFirst(RegExp(r'^Hubera-', caseSensitive: false), '');
  final exact = <String>{'$stem.md'.toLowerCase(), '$bare.md'.toLowerCase()};
  for (final n in list) {
    if (exact.contains(n.toLowerCase())) return n;
  }

  final token = RegExp(
    r'(\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)*)',
    caseSensitive: false,
  ).firstMatch(stem)?.group(1)?.toLowerCase();
  if (token == null || token.length < 10) return null;

  var probe = token;
  while (probe.length >= 10) {
    for (final n in list) {
      final low = n.toLowerCase();
      if (low.endsWith('.md') && low.contains(probe)) return n;
    }
    final cut = probe.lastIndexOf('-');
    if (cut < 10) break;
    probe = probe.substring(0, cut);
  }
  return null;
}

/// Texte lisible d’un export HTML (le PDF imprimé est trop petit sur un téléphone).
String htmlReportToPlain(String html) {
  var s = html.replaceAll('\r\n', '\n');
  s = s.replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), '');
  s = s.replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), '');
  s = s.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'</p>', caseSensitive: false), '\n\n');
  s = s.replaceAll(RegExp(r'</h[1-6]>', caseSensitive: false), '\n\n');
  s = s.replaceAll(RegExp(r'</tr>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'</t[dh]>', caseSensitive: false), ' · ');
  s = s.replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '\n- ');
  s = s.replaceAll(RegExp(r'<h1[^>]*>', caseSensitive: false), '\n# ');
  s = s.replaceAll(RegExp(r'<h2[^>]*>', caseSensitive: false), '\n## ');
  s = s.replaceAll(RegExp(r'<h3[^>]*>', caseSensitive: false), '\n### ');
  s = s.replaceAll(RegExp(r'<[^>]+>'), '');
  s = s
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  s = s.replaceAll(RegExp(r'[ \t]+\n'), '\n');
  s = s.replaceAll(RegExp(r'\n{3,}'), '\n\n');
  return s.trim();
}
