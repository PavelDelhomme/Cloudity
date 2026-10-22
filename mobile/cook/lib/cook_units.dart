/// Unités proposées à la saisie. Une unité absente de la liste reste valable.
const cookBaseUnits = <String>[
  'g',
  'kg',
  'ml',
  'cl',
  'l',
  'c. à s.',
  'c. à c.',
  'pièce',
  'pincée',
  'paquet',
];

/// Unités qu’on peut acheter ou stocker. Jamais une cuillère comme produit.
const cookBuyUnits = <String>{'g', 'kg', 'ml', 'cl', 'l', 'pièce', 'paquet'};

/// Formes longues ou anglaises, plus longues d’abord à l’usage.
const cookUnitRewrites = <(String, String)>[
  ('cuillères à café', 'c. à c.'),
  ('cuillère à café', 'c. à c.'),
  ('cuilleres a cafe', 'c. à c.'),
  ('cuillères à soupe', 'c. à s.'),
  ('cuillère à soupe', 'c. à s.'),
  ('c. à café', 'c. à c.'),
  ('c. a café', 'c. à c.'),
  ('c. à cafe', 'c. à c.'),
  ('c. à soupe', 'c. à s.'),
  ('tablespoons', 'c. à s.'),
  ('tablespoon', 'c. à s.'),
  ('teaspoons', 'c. à c.'),
  ('teaspoon', 'c. à c.'),
  ('millilitres', 'ml'),
  ('milliliters', 'ml'),
  ('millilitre', 'ml'),
  ('milliliter', 'ml'),
  ('grammes', 'g'),
  ('grams', 'g'),
  ('gramme', 'g'),
  ('gram', 'g'),
  ('pieces', 'pièce'),
  ('piece', 'pièce'),
  ('pièces', 'pièce'),
  ('pinches', 'pincée'),
  ('pinch', 'pincée'),
  ('pincées', 'pincée'),
  ('tasses', 'tasse'),
  ('tbsp', 'c. à s.'),
  ('cups', 'tasse'),
  ('tsp', 'c. à c.'),
  ('cup', 'tasse'),
];

/// Suggestions : liste fixe, plus les unités déjà écrites dans le frigo.
/// Une frappe qui ne correspond à rien ne retire pas le texte libre.
List<String> cookUnitSuggestions(String query, Iterable<String> already) {
  final seen = <String>{};
  final all = <String>[];
  void add(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return;
    final key = value.toLowerCase();
    if (!seen.add(key)) return;
    all.add(value);
  }

  for (final unit in cookBaseUnits) {
    add(unit);
  }
  for (final unit in already) {
    add(unit);
  }
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return all;
  return [
    for (final unit in all)
      if (unit.toLowerCase().contains(q)) unit,
  ];
}

/// Mesures lisibles : c. à c., c. à s., g, ml, pièce. Idempotent.
String cookNormalizeUnits(String text) {
  var out = text;
  final phrases = [...cookUnitRewrites]..sort((a, b) => b.$1.length.compareTo(a.$1.length));
  for (final phrase in phrases) {
    out = out.replaceAll(
      RegExp('\\b${RegExp.escape(phrase.$1)}\\b', caseSensitive: false),
      phrase.$2,
    );
  }
  return out.replaceAll('c. à c..', 'c. à c.').replaceAll('c. à s..', 'c. à s.');
}

class CookParsed {
  const CookParsed(this.value, this.unit);

  final double value;
  final String unit;
}

class CookQty {
  const CookQty(this.value, this.unit);

  final double value;
  final String unit;
}

class CookStock {
  const CookStock({
    required this.name,
    required this.qty,
    required this.unit,
    this.usable = true,
  });

  final String name;
  final String qty;
  final String unit;
  final bool usable;
}

class CookBalance {
  const CookBalance({
    required this.name,
    required this.inFridge,
    required this.enough,
    required this.comparable,
    required this.missing,
    this.have,
    this.need,
    this.unit = '',
  });

  final String name;
  final bool inFridge;
  final bool enough;
  final bool comparable;
  final bool missing;
  final double? have;
  final double? need;
  final String unit;
}

double? cookParseNumber(String raw) {
  final t = raw.trim();
  final mixed = RegExp(r'^(\d+)\s+(\d+)/(\d+)$').firstMatch(t);
  if (mixed != null) {
    final den = double.parse(mixed.group(3)!);
    if (den == 0) return null;
    return double.parse(mixed.group(1)!) + double.parse(mixed.group(2)!) / den;
  }
  final frac = RegExp(r'^(\d+)/(\d+)$').firstMatch(t);
  if (frac != null) {
    final den = double.parse(frac.group(2)!);
    if (den == 0) return null;
    return double.parse(frac.group(1)!) / den;
  }
  return double.tryParse(t.replaceAll(',', '.'));
}

String cookCanonicalUnit(String raw) {
  final n = cookNormalizeUnits(raw.trim()).toLowerCase();
  const known = ['c. à c.', 'c. à s.', 'pincée', 'pièce', 'tasse', 'paquet', 'kg', 'ml', 'cl', 'g', 'l'];
  for (final unit in known) {
    if (n == unit) return unit;
  }
  return n;
}

CookParsed? cookParseMeasure(String raw) {
  final s = cookNormalizeUnits(raw.trim());
  if (s.isEmpty) return null;
  final tight = RegExp(r'^(\d+(?:[.,]\d+)?)(kg|ml|cl|g|l)$', caseSensitive: false).firstMatch(s);
  if (tight != null) {
    final value = double.tryParse(tight.group(1)!.replaceAll(',', '.'));
    if (value == null) return null;
    return CookParsed(value, tight.group(2)!.toLowerCase());
  }
  final match = RegExp(r'^(\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)\s+(.+)$').firstMatch(s);
  if (match == null) {
    final value = cookParseNumber(s);
    if (value == null) return null;
    return CookParsed(value, 'pièce');
  }
  final value = cookParseNumber(match.group(1)!);
  if (value == null) return null;
  return CookParsed(value, cookCanonicalUnit(match.group(2)!));
}

bool cookIsLiquid(String ingredient) {
  final n = ingredient.toLowerCase();
  const words = [
    'eau', 'lait', 'huile', 'vinaigre', 'vin', 'bouillon', 'jus', 'crème', 'sauce',
    'water', 'milk', 'oil', 'vinegar', 'wine', 'stock', 'broth', 'juice', 'cream',
  ];
  return words.any(n.contains);
}

/// Grammes pour une c. à c. quand la densité est connue. Sinon null.
double? cookGramsPerTeaspoon(String ingredient) {
  final n = ingredient.toLowerCase();
  if (n.contains('sel') && !n.contains('sellerie')) return 5;
  if (n.contains('sucre') || n.contains('sugar')) return 4;
  if (n.contains('farine') || n.contains('flour')) return 3;
  if (n.contains('beurre') || n.contains('butter')) return 5;
  if (n.contains('riz') || n.contains('rice')) return 5;
  return null;
}

CookQty? cookBaseQty({
  required double value,
  required String unit,
  required String ingredient,
}) {
  switch (unit) {
    case 'g':
      return CookQty(value, 'g');
    case 'kg':
      return CookQty(value * 1000, 'g');
    case 'ml':
      return CookQty(value, 'ml');
    case 'cl':
      return CookQty(value * 10, 'ml');
    case 'l':
      return CookQty(value * 1000, 'ml');
    case 'pièce':
      return CookQty(value, 'pièce');
    case 'tasse':
      final per = cookGramsPerTeaspoon(ingredient);
      if (!cookIsLiquid(ingredient) && per != null) {
        return CookQty(value * 16 * per * 3, 'g');
      }
      return CookQty(value * 240, 'ml');
    case 'c. à c.':
    case 'c. à s.':
    case 'pincée':
      final factor = unit == 'c. à c.' ? 1.0 : unit == 'c. à s.' ? 3.0 : 0.1;
      final ml = unit == 'c. à c.' ? 5.0 : unit == 'c. à s.' ? 15.0 : 0.5;
      if (cookIsLiquid(ingredient)) return CookQty(value * ml, 'ml');
      final per = cookGramsPerTeaspoon(ingredient);
      if (per != null) return CookQty(value * per * factor, 'g');
      return CookQty(value * ml, 'ml');
    default:
      return null;
  }
}

String cookFormatQty(double? value) {
  if (value == null) return '';
  if (value.abs() < 0.05) return '0';
  if ((value - value.round()).abs() < 0.05) return value.round().toString();
  return value.toStringAsFixed(1);
}

bool cookNamesMatch(String a, String b) {
  final x = a.toLowerCase().trim();
  final y = b.toLowerCase().trim();
  if (x.isEmpty || y.isEmpty) return false;
  return x == y || x.contains(y) || y.contains(x);
}

CookBalance cookBalance({
  required String name,
  required List<CookStock> stock,
  double? need,
  String unit = '',
}) {
  final matches = stock.where((s) => s.usable && cookNamesMatch(name, s.name)).toList();
  final inFridge = matches.isNotEmpty;
  if (need == null || unit.isEmpty || !cookBuyUnits.contains(unit)) {
    return CookBalance(
      name: name,
      inFridge: inFridge,
      enough: inFridge,
      comparable: false,
      missing: !inFridge,
    );
  }
  var have = 0.0;
  var comparableStock = false;
  for (final item in matches) {
    final parsed = cookParseMeasure('${item.qty} ${item.unit}'.trim());
    if (parsed == null) continue;
    final base = cookBaseQty(value: parsed.value, unit: parsed.unit, ingredient: name);
    if (base == null || base.unit != unit) continue;
    have += base.value;
    comparableStock = true;
  }
  if (!comparableStock) {
    if (!inFridge && cookBuyUnits.contains(unit)) {
      return CookBalance(
        name: name,
        inFridge: false,
        enough: false,
        comparable: true,
        missing: true,
        have: 0,
        need: need,
        unit: unit,
      );
    }
    return CookBalance(
      name: name,
      inFridge: inFridge,
      enough: inFridge,
      comparable: false,
      missing: !inFridge,
      need: need,
      unit: unit,
    );
  }
  final enough = have + 1e-6 >= need;
  return CookBalance(
    name: name,
    inFridge: inFridge,
    enough: enough,
    comparable: true,
    missing: !enough,
    have: have,
    need: need,
    unit: unit,
  );
}

String cookNameFromShopLabel(String label) {
  var s = cookNormalizeUnits(label.trim());
  s = s.replaceFirst(RegExp(r'^[\d\s/.,]+'), '').trim();
  const units = ['c. à c.', 'c. à s.', 'pincée', 'pièce', 'tasse', 'paquet', 'kg', 'ml', 'cl', 'g', 'l'];
  final low = s.toLowerCase();
  for (final unit in units) {
    if (low.startsWith(unit)) {
      s = s.substring(unit.length).trim();
      break;
    }
  }
  return s.isEmpty ? label.trim() : s;
}
