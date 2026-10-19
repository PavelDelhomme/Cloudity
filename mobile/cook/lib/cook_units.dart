/// Unités proposées à la saisie. Une unité absente de la liste reste valable.
const cookBaseUnits = <String>[
  'g',
  'kg',
  'ml',
  'cl',
  'l',
  'cuillère à soupe',
  'cuillère à café',
  'pièce',
  'pincée',
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
