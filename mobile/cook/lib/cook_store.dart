import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class CookPantryItem {
  CookPantryItem({
    required this.id,
    required this.name,
    this.qty = '',
    this.unit = '',
    this.opened = false,
    this.openedOn = '',
    this.keepDays = 0,
    this.bestBefore = '',
  });

  final String id;
  String name;
  String qty;
  String unit;
  bool opened;

  /// Jour d’ouverture `yyyy-mm-dd`. Vide si non noté.
  String openedOn;

  /// Jours encore bons après ouverture. 0 = non noté.
  int keepDays;

  /// Date limite si le produit est encore fermé, `yyyy-mm-dd`.
  String bestBefore;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'qty': qty,
        'unit': unit,
        'opened': opened,
        'openedOn': openedOn,
        'keepDays': keepDays,
        'bestBefore': bestBefore,
      };

  static CookPantryItem fromJson(Map<String, dynamic> raw) => CookPantryItem(
        id: raw['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
        name: raw['name']?.toString() ?? '',
        qty: raw['qty']?.toString() ?? '',
        unit: raw['unit']?.toString() ?? '',
        opened: raw['opened'] == true,
        openedOn: raw['openedOn']?.toString() ?? '',
        keepDays: int.tryParse(raw['keepDays']?.toString() ?? '') ?? 0,
        bestBefore: raw['bestBefore']?.toString() ?? '',
      );
}

class CookShopItem {
  CookShopItem({
    required this.id,
    required this.name,
    this.done = false,
    this.kind = 'food',
  });

  final String id;
  String name;
  bool done;

  /// `food` (généré depuis le planning) ou `other` (pas alimentaire).
  String kind;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'done': done,
        'kind': kind == 'other' ? 'other' : 'food',
      };

  static CookShopItem fromJson(Map<String, dynamic> raw) => CookShopItem(
        id: raw['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
        name: raw['name']?.toString() ?? '',
        done: raw['done'] == true,
        kind: raw['kind']?.toString() == 'other' ? 'other' : 'food',
      );
}

class CookMeal {
  CookMeal({this.mealId, this.title, this.thumb});

  String? mealId;
  String? title;
  String? thumb;

  bool get isEmpty => (title == null || title!.trim().isEmpty) && (mealId == null || mealId!.isEmpty);

  Map<String, dynamic> toJson() => {
        'mealId': mealId,
        'title': title,
        'thumb': thumb,
      };

  static CookMeal fromJson(Map<String, dynamic>? raw) {
    if (raw == null) return CookMeal();
    return CookMeal(
      mealId: raw['mealId']?.toString(),
      title: raw['title']?.toString(),
      thumb: raw['thumb']?.toString(),
    );
  }
}

class CookData {
  CookData({
    List<CookPantryItem>? pantry,
    List<CookShopItem>? shopping,
    Map<String, Map<String, CookMeal>>? plan,
    List<String>? favorites,
  })  : pantry = pantry ?? [],
        shopping = shopping ?? [],
        plan = plan ?? {},
        favorites = favorites ?? [];

  final List<CookPantryItem> pantry;
  final List<CookShopItem> shopping;
  /// date ISO `yyyy-mm-dd` → slot (`breakfast`/`lunch`/`dinner`) → repas
  final Map<String, Map<String, CookMeal>> plan;
  final List<String> favorites;

  Map<String, dynamic> toJson() => {
        'pantry': pantry.map((e) => e.toJson()).toList(),
        'shopping': shopping.map((e) => e.toJson()).toList(),
        'plan': {
          for (final e in plan.entries)
            e.key: {for (final s in e.value.entries) s.key: s.value.toJson()},
        },
        'favorites': favorites,
      };

  static CookData fromJson(Map<String, dynamic>? raw) {
    if (raw == null) return CookData();
    final pantry = <CookPantryItem>[];
    final p = raw['pantry'];
    if (p is List) {
      for (final item in p) {
        if (item is Map<String, dynamic>) pantry.add(CookPantryItem.fromJson(item));
      }
    }
    final shopping = <CookShopItem>[];
    final s = raw['shopping'];
    if (s is List) {
      for (final item in s) {
        if (item is Map<String, dynamic>) shopping.add(CookShopItem.fromJson(item));
      }
    }
    final plan = <String, Map<String, CookMeal>>{};
    final pl = raw['plan'];
    if (pl is Map) {
      for (final e in pl.entries) {
        final day = <String, CookMeal>{};
        if (e.value is Map) {
          for (final s in (e.value as Map).entries) {
            day[s.key.toString()] = CookMeal.fromJson(
              s.value is Map<String, dynamic> ? s.value as Map<String, dynamic> : null,
            );
          }
        }
        plan[e.key.toString()] = day;
      }
    }
    final favs = <String>[];
    final f = raw['favorites'];
    if (f is List) {
      for (final id in f) {
        final t = id?.toString() ?? '';
        if (t.isNotEmpty) favs.add(t);
      }
    }
    return CookData(pantry: pantry, shopping: shopping, plan: plan, favorites: favs);
  }
}

/// Jeton absent ou refusé après un essai de renouvellement : écran de compte.
class CookSessionRejected implements Exception {
  const CookSessionRejected();
}

enum CookLoadOutcome { ok, refresh, account, error }

/// Un 401 au premier essai demande un renouvellement. Après, ou sans jeton, compte.
CookLoadOutcome cookLoadOutcome({
  required String token,
  required int? status,
  required bool alreadyRefreshed,
}) {
  if (token.trim().isEmpty) return CookLoadOutcome.account;
  if (status == 401) {
    return alreadyRefreshed ? CookLoadOutcome.account : CookLoadOutcome.refresh;
  }
  if (status != null && status != 200) return CookLoadOutcome.error;
  return CookLoadOutcome.ok;
}

/// Un 401 ne produit jamais le message d’échec : refresh, puis compte.
String? cookLoadExceptionMessage(int status) {
  if (status == 200 || status == 401) return null;
  return 'Impossible de charger Hubera Cook ($status)';
}

const cookCacheKey = 'hubera.cook.data.v1';

class CookLoadResult {
  const CookLoadResult({required this.data, this.needsAccount = false});

  final CookData data;
  final bool needsAccount;
}

/// Frigo / planning / courses dans `PUT /auth/me/preferences` (clé `cook`, deep-merge).
class CookStore {
  CookStore({required this.gatewayBase, required String accessToken})
      : accessToken = accessToken;

  final String gatewayBase;
  String accessToken;

  String get _base => gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  Future<http.Response> _get() {
    return http
        .get(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 15));
  }

  static Future<CookData?> readCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(cookCacheKey);
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return CookData.fromJson(decoded);
    } catch (_) {
      return null;
    }
  }

  static Future<void> writeCache(CookData data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(cookCacheKey, jsonEncode(data.toJson()));
  }

  Future<CookLoadResult> _accountResult() async {
    final cached = await readCache();
    return CookLoadResult(data: cached ?? CookData(), needsAccount: true);
  }

  /// 401 : un refresh, puis le sélecteur de compte. Jamais l’exception de chargement.
  /// Le frigo déjà en cache reste dans [CookLoadResult.data].
  Future<CookLoadResult> load({Future<String?> Function()? refresh}) async {
    if (cookLoadOutcome(token: accessToken, status: null, alreadyRefreshed: false) ==
        CookLoadOutcome.account) {
      return _accountResult();
    }
    var res = await _get();
    var outcome = cookLoadOutcome(
      token: accessToken,
      status: res.statusCode,
      alreadyRefreshed: false,
    );
    if (outcome == CookLoadOutcome.refresh && refresh != null) {
      try {
        final next = await refresh();
        if (next != null && next.trim().isNotEmpty) {
          accessToken = next.trim();
        }
      } catch (_) {
        return _accountResult();
      }
      if (accessToken.trim().isEmpty) return _accountResult();
      res = await _get();
      outcome = cookLoadOutcome(
        token: accessToken,
        status: res.statusCode,
        alreadyRefreshed: true,
      );
    }
    if (outcome == CookLoadOutcome.account || outcome == CookLoadOutcome.refresh) {
      return _accountResult();
    }
    final failure = cookLoadExceptionMessage(res.statusCode);
    if (failure != null) {
      throw Exception(failure);
    }
    if (res.statusCode == 401) return _accountResult();
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    final prefs = map['preferences'];
    final cook = prefs is Map ? prefs['cook'] : null;
    final data = CookData.fromJson(cook is Map<String, dynamic> ? cook : null);
    await writeCache(data);
    return CookLoadResult(data: data);
  }

  Future<void> save(CookData data) async {
    await writeCache(data);
    if (accessToken.trim().isEmpty) throw const CookSessionRejected();
    final res = await http
        .put(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken),
          body: jsonEncode({
            'preferences': {'cook': data.toJson()},
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode == 401) throw const CookSessionRejected();
    if (res.statusCode != 200) {
      throw Exception('Enregistrement Cook impossible (${res.statusCode})');
    }
  }
}

String cookNewId() => DateTime.now().microsecondsSinceEpoch.toString();

/// `null` = déjà sur le frigo : le retour ne quitte pas l’app.
int? cookTabAfterSystemBack(int tab) => tab == 0 ? null : 0;

/// Retour depuis Paramètres : accueil (frigo), l’activité racine reste ouverte.
int cookTabAfterSettingsBack() => 0;

/// Le FAB reste actif sur le frigo, les recettes, le menu et la liste de courses.
bool cookFabHandlesTap({required bool settings, required int tab}) =>
    !settings && tab >= 0 && tab <= 3;

String cookDayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

enum CookShopHorizon { week, month }

DateTime cookDateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime? cookParseDay(String raw) {
  final t = raw.trim();
  if (t.length < 10) return null;
  final parsed = DateTime.tryParse(t.substring(0, 10));
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}

/// Produit ouvert : encore bon pendant `keepDays` à partir du jour d’ouverture.
/// Sans date notée, on le compte encore (pas de péremption inventée).
/// Produit fermé : une date limite passée ne compte plus au frigo.
bool cookPantryStillUsable(CookPantryItem item, DateTime today) {
  final day = cookDateOnly(today);
  if (item.opened) {
    final opened = cookParseDay(item.openedOn);
    if (opened == null || item.keepDays <= 0) return true;
    final last = opened.add(Duration(days: item.keepDays));
    return !day.isAfter(last);
  }
  final best = cookParseDay(item.bestBefore);
  if (best == null) return true;
  return !day.isAfter(best);
}

String cookPantryStatusLine(CookPantryItem item, DateTime today) {
  if (item.opened) {
    final opened = cookParseDay(item.openedOn);
    if (opened != null && item.keepDays > 0) {
      final last = cookDayKey(opened.add(Duration(days: item.keepDays)));
      if (!cookPantryStillUsable(item, today)) {
        return 'Ouvert, à racheter (jusqu’au $last)';
      }
      return 'Ouvert, se garde jusqu’au $last';
    }
    return 'Ouvert';
  }
  final best = cookParseDay(item.bestBefore);
  if (best == null) return '';
  final label = cookDayKey(best);
  if (!cookPantryStillUsable(item, today)) return 'Date dépassée ($label)';
  return 'Fermé, date $label';
}

/// Semaine : lundi → dimanche de la date. Mois : tout le mois civil.
List<DateTime> cookHorizonDays(DateTime anchor, CookShopHorizon horizon) {
  final day = cookDateOnly(anchor);
  if (horizon == CookShopHorizon.week) {
    final monday = day.subtract(Duration(days: day.weekday - DateTime.monday));
    return [for (var i = 0; i < 7; i++) monday.add(Duration(days: i))];
  }
  final start = DateTime(day.year, day.month, 1);
  final next = DateTime(day.year, day.month + 1, 1);
  final count = next.difference(start).inDays;
  return [for (var i = 0; i < count; i++) DateTime(start.year, start.month, 1 + i)];
}

bool cookPantryCovers(String ingredient, Iterable<CookPantryItem> pantry, DateTime today) {
  final needle = ingredient.toLowerCase().trim();
  if (needle.isEmpty) return false;
  for (final item in pantry) {
    if (!cookPantryStillUsable(item, today)) continue;
    final name = item.name.toLowerCase().trim();
    if (name.isEmpty) continue;
    if (needle.contains(name) || name.contains(needle)) return true;
  }
  return false;
}

/// Ingrédients du planning (semaine ou mois) absents du frigo encore bon.
/// N’ajoute pas les lignes déjà présentes, y compris le pas-alimentaire.
List<String> cookShoppingLabelsToAdd({
  required Map<String, Map<String, CookMeal>> plan,
  required List<CookPantryItem> pantry,
  required DateTime anchor,
  required CookShopHorizon horizon,
  required Map<String, List<({String name, String measure})>> mealsById,
  required List<CookShopItem> existing,
  required DateTime today,
}) {
  final have = existing.map((s) => s.name.toLowerCase()).toSet();
  final out = <String>[];
  for (final day in cookHorizonDays(anchor, horizon)) {
    final slots = plan[cookDayKey(day)];
    if (slots == null) continue;
    for (final meal in slots.values) {
      final id = meal.mealId;
      if (id == null || id.isEmpty) continue;
      final ingredients = mealsById[id];
      if (ingredients == null) continue;
      for (final ing in ingredients) {
        if (cookPantryCovers(ing.name, pantry, today)) continue;
        final label = ing.measure.trim().isEmpty ? ing.name : '${ing.measure} ${ing.name}';
        final key = label.toLowerCase();
        if (have.contains(key) || out.any((s) => s.toLowerCase() == key)) continue;
        out.add(label);
      }
    }
  }
  return out;
}
