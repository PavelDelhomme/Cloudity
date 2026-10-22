import 'package:cloudity_cook/cook_recipe.dart';
import 'package:cloudity_cook/cook_store.dart';
import 'package:cloudity_cook/cook_translate.dart';
import 'package:cloudity_cook/ingredient_photo.dart';
import 'package:cloudity_cook/mealdb.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('S’utiliser reste sur la recette et une correction est reproposée', (tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    cookRemoteTranslation = false;
    addTearDown(() {
      cookRemoteTranslation = true;
      cookUserFixes.remove('chicken');
    });
    IngredientPhotoCache.memory['sel'] = null;
    IngredientPhotoCache.diskLoaded = true;

    var dinners = 0;
    var shops = 0;
    final seed = MealDetail(
      id: '1',
      title: 'Chicken',
      instructions: 'Heat the pan.',
      ingredients: [(name: 'salt', measure: '1 tsp')],
    );

    Future<void> pumpPage() {
      return tester.pumpWidget(
        MaterialApp(
          home: CookRecipePage(
            summary: const MealSummary(id: '1', title: 'Chicken'),
            pantry: const [],
            favorite: false,
            wanted: false,
            seed: seed,
            onToggleFav: () async {},
            onToggleWant: () async {},
            onSchedule: (slot, _) async {
              if (slot == 'dinner') dinners += 1;
            },
            onShop: (_) async {
              shops += 1;
            },
          ),
        ),
      );
    }

    await pumpPage();
    await tester.pump();

    expect(find.text('poulet'), findsOneWidget);
    expect(find.textContaining('c. à c.'), findsOneWidget);
    expect(find.textContaining('0/5 g'), findsOneWidget);
    expect(find.text('S’utiliser'), findsOneWidget);

    await tester.tap(find.text('pas la bonne traduction').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'poulet rôti');
    await tester.tap(find.text('Retenir'));
    await tester.pumpAndSettle();
    expect(find.text('poulet rôti'), findsOneWidget);
    expect(find.text('S’utiliser'), findsOneWidget);

    await tester.tap(find.text('S’utiliser'));
    await tester.pumpAndSettle();
    expect(find.text('Dîner'), findsOneWidget);
    expect(find.text('Ajouter les ingrédients aux courses'), findsOneWidget);
    await tester.tap(find.text('Dîner'));
    await tester.pumpAndSettle();
    expect(dinners, 1);
    expect(find.text('S’utiliser'), findsOneWidget);
    expect(find.text('Préparer les ingrédients'), findsOneWidget);

    await tester.tap(find.text('S’utiliser'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dîner'));
    await tester.pumpAndSettle();
    expect(dinners, 2);

    await tester.tap(find.text('S’utiliser'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ajouter les ingrédients aux courses'));
    await tester.pumpAndSettle();
    expect(shops, 1);
    expect(dinners, 2);
    expect(find.text('S’utiliser'), findsOneWidget);

    await pumpPage();
    await tester.pump();
    expect(find.text('poulet rôti'), findsOneWidget);
  });
}
