import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:http/http.dart' as http;

class CookPantryItem {
  CookPantryItem({
    required this.id,
    required this.name,
    this.qty = '',
    this.unit = '',
  });

  final String id;
  String name;
  String qty;
  String unit;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'qty': qty,
        'unit': unit,
      };

  static CookPantryItem fromJson(Map<String, dynamic> raw) => CookPantryItem(
        id: raw['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
        name: raw['name']?.toString() ?? '',
        qty: raw['qty']?.toString() ?? '',
        unit: raw['unit']?.toString() ?? '',
      );
}

class CookShopItem {
  CookShopItem({
    required this.id,
    required this.name,
    this.done = false,
  });

  final String id;
  String name;
  bool done;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'done': done};

  static CookShopItem fromJson(Map<String, dynamic> raw) => CookShopItem(
        id: raw['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
        name: raw['name']?.toString() ?? '',
        done: raw['done'] == true,
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

/// Frigo / planning / courses dans `PUT /auth/me/preferences` (clé `cook`, deep-merge).
class CookStore {
  CookStore({required this.gatewayBase, required this.accessToken});

  final String gatewayBase;
  final String accessToken;

  String get _base => gatewayBase.trim().replaceAll(RegExp(r'/$'), '');

  Future<CookData> load() async {
    final res = await http
        .get(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken, json: false),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw Exception('Impossible de charger Hubera Cook (${res.statusCode})');
    }
    final map = jsonDecode(res.body.isEmpty ? '{}' : res.body) as Map<String, dynamic>;
    final prefs = map['preferences'];
    final cook = prefs is Map ? prefs['cook'] : null;
    return CookData.fromJson(cook is Map<String, dynamic> ? cook : null);
  }

  Future<void> save(CookData data) async {
    final res = await http
        .put(
          Uri.parse('$_base/auth/me/preferences'),
          headers: authHeaders(accessToken),
          body: jsonEncode({
            'preferences': {'cook': data.toJson()},
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw Exception('Enregistrement Cook impossible (${res.statusCode})');
    }
  }
}

String cookNewId() => DateTime.now().microsecondsSinceEpoch.toString();

String cookDayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
