import 'package:cloudity_shared/ota_update.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('les notes restent lisibles en texte, en liste, ou sous releaseNotes', () {
    expect(otaReleaseNotes('  Corrige le coffre.  '), 'Corrige le coffre.');
    expect(otaReleaseNotes(['ligne 1', '  ', 'ligne 2']), 'ligne 1\nligne 2');
    expect(otaReleaseNotes(null), '');
    expect(otaReleaseNotes(''), '');
    expect(otaReleaseNotes(20), '20');
  });
}
