import 'package:cloudity_cook/cook_units.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('propose les unités de base et celles déjà saisies', () {
    final list = cookUnitSuggestions('', ['tranche', 'g', '']);
    expect(list.first, 'g');
    expect(list, contains('c. à s.'));
    expect(list, contains('pincée'));
    expect(list, contains('tranche'));
    expect(list.where((u) => u == 'g').length, 1);
  });

  test('filtre sans interdire une unité inconnue', () {
    expect(cookUnitSuggestions('à s', const []), ['c. à s.']);
    expect(cookUnitSuggestions('sachet', ['sachet']), ['sachet']);
    expect(cookUnitSuggestions('xyz', const []), isEmpty);
  });
}
