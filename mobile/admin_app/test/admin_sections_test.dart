import 'package:flutter_test/flutter_test.dart';
import 'package:admin_app/features/admin_sections.dart';

void main() {
  test('Admin ne recopie pas les vues Docs', () {
    expect(adminCopiesDocs(adminSectionLabels.values), isFalse);
    expect(adminSectionIds, isNot(contains('kanban')));
    expect(adminSectionIds, contains('apps'));
    expect(adminSectionIds, contains('errors'));
  });
}
