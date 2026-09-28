/** Texte lisible depuis un corps HTML mail (sans WebView). */
String htmlToReadable(String html) {
  var s = html;
  s = s.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'</p>', caseSensitive: false), '\n\n');
  s = s.replaceAll(RegExp(r'</div>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), '');
  s = s.replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), '');
  s = s.replaceAll(RegExp(r'<[^>]+>'), '');
  s = s
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  return s.replaceAll(RegExp(r'\n{3,}'), '\n\n').trim();
}
