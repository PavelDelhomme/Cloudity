import 'package:cloudity_cook/ingredient_photo.dart';
import 'package:cloudity_cook/ingredient_suggest.dart';
import 'package:cloudity_cook/cook_ingredient_fields.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('la recherche propose le nom et garde le préfixe devant', () {
    final hits = cookIngredientSuggestions('tom');
    expect(hits, contains('tomate'));
    expect(hits.first, 'tomate');
    expect(hits, contains('tomates concassées'));
    expect(hits, isNot(contains('ajouter')));
    expect(hits, isNot(contains('cuillère à soupe')));
  });

  test('sans texte, la liste reste le catalogue', () {
    final hits = cookIngredientSuggestions('');
    expect(hits, isNotEmpty);
    expect(hits.first, cookIngredientCatalog.first);
    expect(hits.length, lessThanOrEqualTo(8));
  });

  test('un accent ne bloque pas la proposition', () {
    expect(cookIngredientSuggestions('oeuf'), contains('œuf'));
    expect(cookIngredientSuggestions('epin'), contains('épinards'));
  });

  testWidgets('un tap sur la proposition remplit le champ', (tester) async {
    IngredientPhotoCache.resetForTests();
    IngredientPhotoCache.diskLoaded = true;
    for (final name in cookIngredientSuggestions('tom')) {
      IngredientPhotoCache.memory[name] = null;
    }
    IngredientPhotoCache.memory['tom'] = null;
    final name = TextEditingController();
    final qty = TextEditingController();
    final unit = TextEditingController();
    addTearDown(name.dispose);
    addTearDown(qty.dispose);
    addTearDown(unit.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CookIngredientFields(
            name: name,
            qty: qty,
            unit: unit,
            knownUnits: const ['g'],
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).first, 'tom');
    await tester.pump();
    expect(find.text('tomate'), findsOneWidget);
    await tester.tap(find.text('tomate'));
    await tester.pump();
    expect(name.text, 'tomate');
  });
}
