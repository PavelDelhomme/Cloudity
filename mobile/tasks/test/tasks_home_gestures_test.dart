import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('liste de tâches vide efface le cache, le retour ne quitte pas', () {
    expect(suiteHomeCachePayload(const []), isNull);
    expect(
      suiteHomeCachePayload(const [
        {'title': 'Courses'},
      ]),
      contains('Courses'),
    );
    expect(decideSuiteRootBack(showSettings: false), SuiteRootBack.stay);
    expect(
      decideSuiteRootBack(showSettings: false, pageHandlesBack: true),
      SuiteRootBack.handledByPage,
    );
  });
}
