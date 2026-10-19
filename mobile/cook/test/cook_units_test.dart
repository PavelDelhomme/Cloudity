import 'package:cloudity_cook/cook_units.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('propose les unités de base et celles déjà saisies', () {
    final list = cookUnitSuggestions('', ['tranche', 'g', '']);
    expect(list.first, 'g');
    expect(list, contains('cuillère à soupe'));
    expect(list, contains('pincée'));
    expect(list, contains('tranche'));
    expect(list.where((u) => u == 'g').length, 1);
  });

  test('filtre sans interdire une unité inconnue', () {
    expect(cookUnitSuggestions('soupe', const []), ['cuillère à soupe']);
    expect(cookUnitSuggestions('sachet', ['sachet']), ['sachet']);
    expect(cookUnitSuggestions('xyz', const []), isEmpty);
  });
}
