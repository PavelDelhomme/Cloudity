import 'package:cloudity_cook/cook_store.dart';
import 'package:cloudity_cook/cook_units.dart';
import 'package:cloudity_cook/ingredient_photo.dart';
import 'package:cloudity_cook/mealdb.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('semaine du mercredi 21 oct 2026 : lundi 19 au dimanche 25', () {
    final days = cookHorizonDays(DateTime(2026, 10, 21), CookShopHorizon.week);
    expect(days.first, DateTime(2026, 10, 19));
    expect(days.last, DateTime(2026, 10, 25));
    expect(days, hasLength(7));
  });

  test('mois d’octobre 2026 : 31 jours', () {
    final days = cookHorizonDays(DateTime(2026, 10, 21), CookShopHorizon.month);
    expect(days.first, DateTime(2026, 10, 1));
    expect(days.last, DateTime(2026, 10, 31));
    expect(days, hasLength(31));
  });

  test('crème fraîche ouverte le 18, 3 jours : encore bonne le 21, plus le 22', () {
    final item = CookPantryItem(
      id: '1',
      name: 'crème fraîche',
      opened: true,
      openedOn: '2026-10-18',
      keepDays: 3,
    );
    expect(cookPantryStillUsable(item, DateTime(2026, 10, 21)), isTrue);
    expect(cookPantryStillUsable(item, DateTime(2026, 10, 22)), isFalse);
    expect(cookPantryStatusLine(item, DateTime(2026, 10, 22)), contains('à racheter'));
  });

  test('produit fermé dont la date est passée ne couvre plus la recette', () {
    final pantry = [
      CookPantryItem(id: '1', name: 'lait', bestBefore: '2026-10-20'),
    ];
    expect(cookPantryCovers('lait', pantry, DateTime(2026, 10, 21)), isFalse);
    expect(cookPantryCovers('lait', pantry, DateTime(2026, 10, 20)), isTrue);
  });

  test('génération semaine : repas du lundi, pas le jour seul, frigo périmé racheté', () {
    final plan = {
      '2026-10-19': {
        'lunch': [CookMeal(mealId: 'm1', title: 'Lundi')],
      },
      '2026-10-21': {
        'dinner': [CookMeal(mealId: 'm2', title: 'Mercredi')],
      },
    };
    final labels = cookShoppingLabelsToAdd(
      plan: plan,
      pantry: [
        CookPantryItem(
          id: 'p',
          name: 'crème fraîche',
          opened: true,
          openedOn: '2026-10-18',
          keepDays: 3,
        ),
      ],
      anchor: DateTime(2026, 10, 21),
      horizon: CookShopHorizon.week,
      mealsById: {
        'm1': [(name: 'poulet', measure: '200 g'), (name: 'crème fraîche', measure: '')],
        'm2': [(name: 'riz', measure: '100 g')],
      },
      existing: [
        CookShopItem(id: 's', name: 'lessive', kind: 'other'),
      ],
      today: DateTime(2026, 10, 22),
    );
    expect(labels, ['200 g poulet', 'crème fraîche', '100 g riz']);
    expect(labels, isNot(contains('lessive')));
  });

  test('le frigo ouvert se relit', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    final data = CookData(
      pantry: [
        CookPantryItem(
          id: '1',
          name: 'crème fraîche',
          opened: true,
          openedOn: '2026-10-18',
          keepDays: 3,
        ),
      ],
      shopping: [CookShopItem(id: '2', name: 'éponges', kind: 'other')],
    );
    await CookStore.writeCache(data);
    final loaded = await CookStore.readCache();
    expect(loaded?.pantry.single.opened, isTrue);
    expect(loaded?.pantry.single.keepDays, 3);
    expect(loaded?.shopping.single.kind, 'other');
  });

  test('1 c. à c. de sel déjà au frigo en grammes n’est pas une cuillère à acheter', () {
    final labels = cookShoppingLabelsToAdd(
      plan: {
        '2026-10-22': {
          'dinner': [CookMeal(mealId: 'm', title: 'Sel')],
        },
      },
      pantry: [CookPantryItem(id: 'p', name: 'sel', qty: '500', unit: 'g')],
      anchor: DateTime(2026, 10, 22),
      horizon: CookShopHorizon.week,
      mealsById: {
        'm': [(name: 'salt', measure: '1 tsp')],
      },
      existing: const [],
      today: DateTime(2026, 10, 22),
    );
    expect(labels, isEmpty);
  });

  test('1 c. à c. de sel est 5 g, avec la photo du sel, pas une cuillère', () {
    final needs = cookNeedsForIngredients(
      ingredients: [(name: 'sel', measure: '1 c. à c.')],
      pantry: const [],
      existing: const [],
      today: DateTime(2026, 10, 22),
    );
    expect(needs, hasLength(1));
    expect(needs.single.label, '5 g sel');
    expect(needs.single.unit, 'g');
    expect(needs.single.label.contains('cuillère'), isFalse);
    expect(needs.single.label.contains('c. à c.'), isFalse);
    final item = CookShopItem(
      id: 's',
      name: '1 c. à c. de sel',
      ingredient: needs.single.ingredient,
      qty: '1',
      unit: 'c. à c.',
    );
    expect(cookShopTitle(item), '5 g sel');
    expect(cookShopVisibleQty(item), '5 g');
    expect(cookShopPhotoName(item), 'sel');
    expect(cookPhotoQuery('sel'), 'table salt');
    final stored = CookShopItem(id: 'old', name: '1 c. à café sel');
    expect(cookShopTitle(stored), '5 g sel');
    expect(cookShopPhotoName(stored), 'sel');
    expect(cookShopTitle(stored).contains('café'), isFalse);
    expect(cookShopTitle(stored).contains('cuillère'), isFalse);
  });

  test('une quantité stockable saisie remplace la c. à c.', () {
    final item = CookShopItem(
      id: 's',
      name: '1 c. à c. de sel',
      qty: '250',
      unit: 'g',
    );
    expect(cookShopVisibleQty(item), '250 g');
    expect(cookShopTitle(item), '250 g sel');
    expect(cookShopTitle(item).contains('c. à c.'), isFalse);
    expect(cookRecipesShortfall(qty: 250, planned: 5, recipes: ['Soupe']), '');
    expect(
      cookRecipesShortfall(qty: 1, planned: 5, recipes: ['Soupe', 'Pain']),
      'Pas assez pour : Soupe, Pain',
    );
  });

  test('sans sel, la course est en grammes', () {
    final labels = cookShoppingLabelsToAdd(
      plan: {
        '2026-10-22': {
          'dinner': [CookMeal(mealId: 'm', title: 'Sel')],
        },
      },
      pantry: const [],
      anchor: DateTime(2026, 10, 22),
      horizon: CookShopHorizon.week,
      mealsById: {
        'm': [(name: 'salt', measure: '1 teaspoon')],
      },
      existing: const [],
      today: DateTime(2026, 10, 22),
    );
    expect(labels, ['5 g sel']);
    expect(labels.single.contains('cuillère'), isFalse);
  });

  test('deux dîners restent, un paquet de sel couvre la pincée', () {
    final plan = <String, Map<String, List<CookMeal>>>{};
    cookAppendMeal(plan, '2026-10-22', 'dinner', CookMeal(mealId: 'a', title: 'A'));
    cookAppendMeal(plan, '2026-10-22', 'dinner', CookMeal(mealId: 'a', title: 'A'));
    expect(plan['2026-10-22']!['dinner'], hasLength(2));
    final balance = cookPantryBalance(
      ingredient: 'salt',
      measure: '1 pinch',
      pantry: [CookPantryItem(id: 'p', name: 'sel', qty: '1', unit: 'paquet')],
      today: DateTime(2026, 10, 22),
    );
    expect(balance.inFridge, isTrue);
    expect(balance.missing, isFalse);
    expect(cookNormalizeUnits('1 teaspoon'), '1 c. à c.');
    expect(cookNormalizeUnits(cookNormalizeUnits('1 tablespoon')), '1 c. à s.');
    cookUserFixes['salt'] = 'fleur de sel';
    addTearDown(() => cookUserFixes.remove('salt'));
    expect(cookToFrenchLearned('salt'), 'fleur de sel');
  });
}
