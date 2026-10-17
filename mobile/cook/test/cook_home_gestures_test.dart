import 'package:cloudity_cook/cook_home.dart';
import 'package:cloudity_cook/cook_store.dart';
import 'package:cloudity_cook/mealdb.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('retour depuis recettes ou courses revient au frigo, pas hors de l’app', () {
    expect(cookTabAfterSystemBack(0), isNull);
    expect(cookTabAfterSystemBack(1), 0);
    expect(cookTabAfterSystemBack(3), 0);
  });

  test('retour paramètres revient à l’accueil', () {
    expect(cookTabAfterSettingsBack(), 0);
  });

  test('jeton vide ou 401 après renouvellement ouvre le compte, pas une exception', () {
    expect(
      cookLoadOutcome(token: '', status: null, alreadyRefreshed: false),
      CookLoadOutcome.account,
    );
    expect(
      cookLoadOutcome(token: 'tok', status: 401, alreadyRefreshed: false),
      CookLoadOutcome.refresh,
    );
    expect(
      cookLoadOutcome(token: 'tok', status: 401, alreadyRefreshed: true),
      CookLoadOutcome.account,
    );
    expect(
      cookLoadOutcome(token: 'tok', status: 500, alreadyRefreshed: true),
      CookLoadOutcome.error,
    );
    expect(
      cookLoadOutcome(token: 'tok', status: 200, alreadyRefreshed: false),
      CookLoadOutcome.ok,
    );
    expect(cookLoadExceptionMessage(401), isNull);
    expect(cookLoadExceptionMessage(200), isNull);
    expect(cookLoadExceptionMessage(500), 'Impossible de charger Hubera Cook (500)');
  });

  test('le frigo en cache se relit', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    final data = CookData(
      pantry: [CookPantryItem(id: '1', name: 'œufs', qty: '6')],
    );
    await CookStore.writeCache(data);
    final loaded = await CookStore.readCache();
    expect(loaded?.pantry.single.name, 'œufs');
    expect(loaded?.pantry.single.qty, '6');
  });

  test('le FAB du menu et de la liste reste cliquable', () {
    expect(cookFabHandlesTap(settings: false, tab: 1), isTrue);
    expect(cookFabHandlesTap(settings: false, tab: 2), isTrue);
    expect(cookFabHandlesTap(settings: false, tab: 3), isTrue);
    expect(cookFabHandlesTap(settings: true, tab: 3), isFalse);
  });

  test('recettes et ingrédients affichés en français', () {
    expect(cookToFrench('Chicken'), 'poulet');
    expect(cookToFrench('olive oil'), 'huile d’olive');
    expect(cookToFrench('Chicken and rice'), 'poulet et riz');
    expect(cookQueryToEnglish('poulet'), 'chicken');
  });

  testWidgets('frigo vide propose d’ajouter', (tester) async {
    var added = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CookEmptyPantry(onAdd: () => added += 1)),
      ),
    );
    expect(find.text('Frigo vide'), findsOneWidget);
    await tester.tap(find.text('Ajouter'));
    expect(added, 1);
  });
}
