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
  final q = query.trim();
  if (q.isEmpty) return mealDbRandomBatch();
  final res = await http
      .get(Uri.parse('$_mealDb/search.php?s=${Uri.encodeQueryComponent(q)}'))
      .timeout(const Duration(seconds: 8));
  if (res.statusCode != 200) return [];
  return _summaries(res.body);
}

Future<List<MealSummary>> mealDbByIngredient(String ingredient) async {
  final q = ingredient.trim();
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

Future<List<MealSummary>> mealDbRandomBatch() async {
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
    ingredients.add((name: name, measure: measure));
  }
  return MealDetail(
    id: raw['idMeal']?.toString() ?? id,
    title: raw['strMeal']?.toString() ?? 'Recette',
    instructions: raw['strInstructions']?.toString() ?? '',
    ingredients: ingredients,
    thumb: raw['strMealThumb']?.toString(),
    category: raw['strCategory']?.toString(),
    area: raw['strArea']?.toString(),
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
      title: title,
      thumb: raw['strMealThumb']?.toString(),
    ));
  }
  return out;
}
