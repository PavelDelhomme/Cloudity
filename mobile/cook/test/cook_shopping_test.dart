import 'package:cloudity_cook/cook_store.dart';
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
        'lunch': CookMeal(mealId: 'm1', title: 'Lundi'),
      },
      '2026-10-21': {
        'dinner': CookMeal(mealId: 'm2', title: 'Mercredi'),
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
}
