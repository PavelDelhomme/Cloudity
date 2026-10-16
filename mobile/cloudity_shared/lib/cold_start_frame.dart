import 'dart:convert';

/// Liste d'accueil décodée hors réseau, avec le temps du décodage.
class ColdStartFrame {
  const ColdStartFrame({required this.items, required this.decodeUs});

  final List<Map<String, dynamic>> items;
  final int decodeUs;
}

List<Map<String, dynamic>> decodeSuiteListCache(String? raw) {
  if (raw == null || raw.isEmpty) return const [];
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return [
      for (final item in decoded)
        if (item is Map) Map<String, dynamic>.from(item),
    ];
  } catch (_) {
    return const [];
  }
}

ColdStartFrame measureListDecode(String? raw) {
  final sw = Stopwatch()..start();
  final items = decodeSuiteListCache(raw);
  sw.stop();
  return ColdStartFrame(items: items, decodeUs: sw.elapsedMicroseconds);
}
