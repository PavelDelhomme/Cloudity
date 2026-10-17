import 'dart:convert';

import 'package:http/http.dart' as http;

const _mealDb = 'https://www.themealdb.com/api/json/v1/1';

class MealSummary {
  const MealSummary({required this.id, required this.title, this.thumb});

  final String id;
  final String title;
  final String? thumb;
}

class MealDetail {
  const MealDetail({
    required this.id,
    required this.title,
    required this.instructions,
    required this.ingredients,
    this.thumb,
    this.category,
    this.area,
    this.youtube,
  });

  final String id;
  final String title;
  final String instructions;
  final List<({String name, String measure})> ingredients;
  final String? thumb;
  final String? category;
  final String? area;
  final String? youtube;
}

Future<List<MealSummary>> mealDbSearch(String query) async {
  final q = cookQueryToEnglish(query.trim());
  if (q.isEmpty) return mealDbRandomBatch();
  final res = await http
      .get(Uri.parse('$_mealDb/search.php?s=${Uri.encodeQueryComponent(q)}'))
      .timeout(const Duration(seconds: 8));
  if (res.statusCode != 200) return [];
  return _summaries(res.body);
}

Future<List<MealSummary>> mealDbByIngredient(String ingredient) async {
  final q = cookQueryToEnglish(ingredient.trim());
  if (q.isEmpty) return [];
  final res = await http.get(Uri.parse('$_mealDb/filter.php?i=${Uri.encodeQueryComponent(q)}'));
  if (res.statusCode != 200) return [];
  return _summaries(res.body);
}

const _letters = 'abcdefghijklmnopqrstuvwxyz';

Future<List<MealSummary>> mealDbByLetter(String letter) async {
  final L = letter.trim().toLowerCase();
  if (L.isEmpty) return [];
  final res = await http
      .get(Uri.parse('$_mealDb/search.php?f=${Uri.encodeQueryComponent(L[0])}'))
      .timeout(const Duration(seconds: 8));
  if (res.statusCode != 200) return [];
  return _summaries(res.body);
}

/// Page suivante (lettres a→z) pour le scroll infini.
Future<({List<MealSummary> meals, int nextIndex})> mealDbLetterPage(int startIndex) async {
  var i = startIndex;
  while (i < _letters.length) {
    final list = await mealDbByLetter(_letters[i]);
    i += 1;
    if (list.isNotEmpty) return (meals: list, nextIndex: i);
  }
  return (meals: <MealSummary>[], nextIndex: _letters.length);
}

Future<List<MealSummary>> mealDbFrench() async {
  final res = await http
      .get(Uri.parse('$_mealDb/filter.php?a=French'))
      .timeout(const Duration(seconds: 8));
  if (res.statusCode != 200) return [];
  return _summaries(res.body);
}

Future<List<MealSummary>> mealDbRandomBatch() async {
  final french = await mealDbFrench();
  if (french.isNotEmpty) return french;
  final first = await mealDbLetterPage(0);
  if (first.meals.isNotEmpty) return first.meals;
  final out = <MealSummary>[];
  final seen = <String>{};
  final res = await http.get(Uri.parse('$_mealDb/random.php')).timeout(const Duration(seconds: 8));
  if (res.statusCode == 200) {
    for (final m in _summaries(res.body)) {
      if (seen.add(m.id)) out.add(m);
    }
  }
  return out;
}

Future<MealDetail?> mealDbLookup(String id) async {
  final res = await http.get(Uri.parse('$_mealDb/lookup.php?i=${Uri.encodeQueryComponent(id)}'));
  if (res.statusCode != 200) return null;
  final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
  final meals = map['meals'];
  if (meals is! List || meals.isEmpty || meals.first is! Map) return null;
  final raw = Map<String, dynamic>.from(meals.first as Map);
  final ingredients = <({String name, String measure})>[];
  for (var i = 1; i <= 20; i++) {
    final name = raw['strIngredient$i']?.toString().trim() ?? '';
    final measure = raw['strMeasure$i']?.toString().trim() ?? '';
    if (name.isEmpty) continue;
    ingredients.add((name: cookToFrench(name), measure: cookToFrench(measure)));
  }
  return MealDetail(
    id: raw['idMeal']?.toString() ?? id,
    title: cookToFrench(raw['strMeal']?.toString() ?? 'Recette'),
    instructions: cookToFrench(raw['strInstructions']?.toString() ?? ''),
    ingredients: ingredients,
    thumb: raw['strMealThumb']?.toString(),
    category: raw['strCategory'] == null ? null : cookToFrench(raw['strCategory'].toString()),
    area: raw['strArea'] == null ? null : cookToFrench(raw['strArea'].toString()),
    youtube: raw['strYoutube']?.toString(),
  );
}

Future<List<MealSummary>> mealDbSuggestFromPantry(List<String> names) async {
  final seen = <String>{};
  final out = <MealSummary>[];
  for (final name in names.take(6)) {
    if (name.trim().length < 2) continue;
    final list = await mealDbByIngredient(name);
    for (final m in list) {
      if (seen.add(m.id)) out.add(m);
      if (out.length >= 24) return out;
    }
  }
  if (out.isEmpty) return mealDbRandomBatch();
  return out;
}

const _enToFr = {
  'olive oil': 'huile d’olive',
  'vegetable oil': 'huile végétale',
  'soy sauce': 'sauce soja',
  'double cream': 'crème épaisse',
  'heavy cream': 'crème épaisse',
  'sour cream': 'crème aigre',
  'spring onion': 'oignon nouveau',
  'spring onions': 'oignons nouveaux',
  'red pepper': 'poivron rouge',
  'green pepper': 'poivron vert',
  'black pepper': 'poivre noir',
  'chicken breast': 'blanc de poulet',
  'chicken stock': 'bouillon de poulet',
  'beef stock': 'bouillon de bœuf',
  'minced beef': 'bœuf haché',
  'ground beef': 'bœuf haché',
  'self-raising flour': 'farine avec levure',
  'plain flour': 'farine',
  'brown sugar': 'sucre roux',
  'caster sugar': 'sucre en poudre',
  'baking powder': 'levure chimique',
  'tomato puree': 'concentré de tomate',
  'chopped tomatoes': 'tomates concassées',
  'potatoes': 'pommes de terre',
  'potato': 'pomme de terre',
  'tomatoes': 'tomates',
  'tomato': 'tomate',
  'onions': 'oignons',
  'onion': 'oignon',
  'carrots': 'carottes',
  'carrot': 'carotte',
  'mushrooms': 'champignons',
  'mushroom': 'champignon',
  'chicken': 'poulet',
  'beef': 'bœuf',
  'pork': 'porc',
  'lamb': 'agneau',
  'garlic': 'ail',
  'butter': 'beurre',
  'flour': 'farine',
  'sugar': 'sucre',
  'salt': 'sel',
  'pepper': 'poivre',
  'eggs': 'œufs',
  'egg': 'œuf',
  'milk': 'lait',
  'cheese': 'fromage',
  'cheddar': 'cheddar',
  'parmesan': 'parmesan',
  'water': 'eau',
  'rice': 'riz',
  'pasta': 'pâtes',
  'noodles': 'nouilles',
  'lemon': 'citron',
  'lime': 'citron vert',
  'wine': 'vin',
  'thyme': 'thym',
  'parsley': 'persil',
  'basil': 'basilic',
  'oregano': 'origan',
  'rosemary': 'romarin',
  'cream': 'crème',
  'bread': 'pain',
  'oil': 'huile',
  'soup': 'soupe',
  'stew': 'ragoût',
  'salad': 'salade',
  'sauce': 'sauce',
  'stock': 'bouillon',
  'broth': 'bouillon',
  'fish': 'poisson',
  'salmon': 'saumon',
  'tuna': 'thon',
  'shrimp': 'crevettes',
  'prawns': 'crevettes',
  'bacon': 'lard',
  'ham': 'jambon',
  'sausage': 'saucisse',
  'beans': 'haricots',
  'lentils': 'lentilles',
  'spinach': 'épinards',
  'cabbage': 'chou',
  'lettuce': 'laitue',
  'cucumber': 'concombre',
  'zucchini': 'courgette',
  'courgette': 'courgette',
  'aubergine': 'aubergine',
  'eggplant': 'aubergine',
  'apple': 'pomme',
  'apples': 'pommes',
  'honey': 'miel',
  'vinegar': 'vinaigre',
  'mustard': 'moutarde',
  'yoghurt': 'yaourt',
  'yogurt': 'yaourt',
  'chocolate': 'chocolat',
  'vanilla': 'vanille',
  'cinnamon': 'cannelle',
  'ginger': 'gingembre',
  'chilli': 'piment',
  'chili': 'piment',
  'coriander': 'coriandre',
  'cumin': 'cumin',
  'paprika': 'paprika',
  'nutmeg': 'muscade',
  'bay leaf': 'feuille de laurier',
  'bay leaves': 'feuilles de laurier',
  'clove': 'clou de girofle',
  'cloves': 'gousses',
  'tablespoons': 'cuillères à soupe',
  'tablespoon': 'cuillère à soupe',
  'teaspoons': 'cuillères à café',
  'teaspoon': 'cuillère à café',
  'tbsp': 'c. à soupe',
  'tsp': 'c. à café',
  'cups': 'tasses',
  'cup': 'tasse',
  'pinch': 'pincée',
  'slice': 'tranche',
  'slices': 'tranches',
  'clove of garlic': 'gousse d’ail',
  'preheat': 'préchauffer',
  'heat': 'chauffer',
  'boil': 'bouillir',
  'simmer': 'mijoter',
  'fry': 'faire revenir',
  'stir': 'remuer',
  'bake': 'cuire au four',
  'roast': 'rôtir',
  'grill': 'griller',
  'chop': 'hacher',
  'slice the': 'couper',
  'add': 'ajouter',
  'mix': 'mélanger',
  'serve': 'servir',
  'until': 'jusqu’à',
  'then': 'puis',
  'and': 'et',
  'with': 'avec',
  'into': 'dans',
  'over': 'sur',
  'the oven': 'le four',
  'oven': 'four',
  'pan': 'poêle',
  'pot': 'casserole',
  'bowl': 'saladier',
  'minutes': 'minutes',
  'minute': 'minute',
  'french': 'française',
  'italian': 'italienne',
  'indian': 'indienne',
  'chinese': 'chinoise',
  'british': 'britannique',
  'american': 'américaine',
  'mexican': 'mexicaine',
  'dessert': 'dessert',
  'breakfast': 'petit-déjeuner',
  'side': 'accompagnement',
  'starter': 'entrée',
  'vegetarian': 'végétarien',
  'seafood': 'fruits de mer',
  'goat': 'chèvre',
  'duck': 'canard',
  'turkey': 'dinde',
};

final List<String> _enToFrKeys = _enToFr.keys.toList()
  ..sort((a, b) => b.length.compareTo(a.length));

final Map<String, String> _frToEn = {
  for (final e in _enToFr.entries) e.value: e.key,
};

String cookToFrench(String text) {
  final raw = text.trim();
  if (raw.isEmpty) return raw;
  var out = raw;
  for (final key in _enToFrKeys) {
    out = out.replaceAll(
      RegExp('\\b${RegExp.escape(key)}\\b', caseSensitive: false),
      _enToFr[key]!,
    );
  }
  return out;
}

String cookQueryToEnglish(String text) {
  final raw = text.trim();
  if (raw.isEmpty) return raw;
  final direct = _frToEn[raw.toLowerCase()];
  if (direct != null) return direct;
  var out = raw;
  final keys = _frToEn.keys.toList()..sort((a, b) => b.length.compareTo(a.length));
  for (final key in keys) {
    out = out.replaceAll(
      RegExp('\\b${RegExp.escape(key)}\\b', caseSensitive: false),
      _frToEn[key]!,
    );
  }
  return out;
}

List<MealSummary> _summaries(String body) {
  final map = jsonDecode(body.isEmpty ? '{}' : body) as Map<String, dynamic>;
  final meals = map['meals'];
  if (meals is! List) return [];
  final out = <MealSummary>[];
  for (final raw in meals) {
    if (raw is! Map) continue;
    final id = raw['idMeal']?.toString() ?? '';
    final title = raw['strMeal']?.toString() ?? '';
    if (id.isEmpty || title.isEmpty) continue;
    out.add(MealSummary(
      id: id,
      title: cookToFrench(title),
      thumb: raw['strMealThumb']?.toString(),
    ));
  }
  return out;
}
