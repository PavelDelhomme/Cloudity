import 'package:admin_app/docs/report_open.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('le PDF de nuit ouvre la note du même jour', () {
    final note = companionNoteName('Hubera-2026-10-16-nuit.pdf', [
      'Hubera-2026-10-16-nuit.pdf',
      '2026-10-16-nuit.md',
      'autre.pdf',
    ]);
    expect(note, '2026-10-16-nuit.md');
  });

  test('une note s’ouvre elle-même', () {
    expect(
      companionNoteName('2026-10-16-nuit.md', ['2026-10-16-nuit.md']),
      '2026-10-16-nuit.md',
    );
  });

  test('le HTML imprimé devient du texte', () {
    final plain = htmlReportToPlain('<style>h1{font-size:9pt}</style><h1>Nuit</h1><p>Mail 1.0.23</p>');
    expect(plain, contains('Nuit'));
    expect(plain, contains('Mail 1.0.23'));
    expect(plain.contains('font-size'), isFalse);
  });
}
