/// Catalogue d’ingrédients proposé sous le champ « Ajouter au frigo ».
const cookIngredientCatalog = <String>[
  'ail',
  'aubergine',
  'basilic',
  'beurre',
  'bœuf',
  'bœuf haché',
  'bouillon',
  'bouillon de poulet',
  'carotte',
  'champignon',
  'chocolat',
  'chou',
  'citron',
  'concentré de tomate',
  'concombre',
  'coriandre',
  'courgette',
  'crème',
  'crevettes',
  'cumin',
  'eau',
  'épinards',
  'farine',
  'fromage',
  'gingembre',
  'haricots',
  'huile',
  'huile d’olive',
  'jambon',
  'lait',
  'laitue',
  'lard',
  'lentilles',
  'miel',
  'moutarde',
  'oignon',
  'origan',
  'pain',
  'pâtes',
  'persil',
  'piment',
  'poisson',
  'poivre',
  'poivron rouge',
  'pomme',
  'pomme de terre',
  'poulet',
  'riz',
  'salade',
  'sauce soja',
  'saucisse',
  'saumon',
  'sel',
  'sucre',
  'thon',
  'thym',
  'tomate',
  'tomates concassées',
  'vanille',
  'vinaigre',
  'yaourt',
  'œuf',
  'œufs',
];

String foldIngredientQuery(String raw) {
  var s = raw.trim().toLowerCase();
  const pairs = {
    'à': 'a',
    'â': 'a',
    'ä': 'a',
    'é': 'e',
    'è': 'e',
    'ê': 'e',
    'ë': 'e',
    'î': 'i',
    'ï': 'i',
    'ô': 'o',
    'ö': 'o',
    'ù': 'u',
    'û': 'u',
    'ü': 'u',
    'ç': 'c',
    'œ': 'oe',
    '’': '\'',
  };
  pairs.forEach((from, to) {
    s = s.replaceAll(from, to);
  });
  return s;
}

/// Préfixe d’abord, puis le reste du nom. Vide = le catalogue, dans l’ordre.
List<String> cookIngredientSuggestions(
  String query, {
  List<String> catalog = cookIngredientCatalog,
  int limit = 8,
}) {
  final q = foldIngredientQuery(query);
  final starts = <String>[];
  final contains = <String>[];
  for (final name in catalog) {
    final n = foldIngredientQuery(name);
    if (q.isEmpty || n.startsWith(q)) {
      starts.add(name);
    } else if (n.contains(q)) {
      contains.add(name);
    }
  }
  return [...starts, ...contains].take(limit).toList();
}
