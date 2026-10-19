import 'package:cloudity_shared/auth/hubera_id_launch.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('les codes publiés collent à la formule', () {
    expect(huberaVersionCode('0.1.3'), 103);
    expect(huberaVersionCode('0.1.12'), 112);
    expect(huberaVersionCode('0.1.16'), 116);
    expect(huberaIdSessionMinimumCode, 112);
  });

  test('ID 0.1.16 déjà là : reprise, sans effacement et sans install silencieuse', () {
    final plan = planHuberaIdLaunch(
      android: true,
      idInstalled: true,
      installedVersionCode: 116,
      minimumSessionCode: huberaIdSessionMinimumCode,
    );
    expect(plan.action, HuberaIdLaunch.resume);
    expect(plan.clearSessionOnUpdate, isFalse);
    expect(plan.silentInstall, isFalse);
  });

  test('ID 0.1.3 code 103 : trop ancien pour la session, proposition seulement', () {
    final plan = planHuberaIdLaunch(
      android: true,
      idInstalled: true,
      installedVersionCode: huberaVersionCode('0.1.3'),
      minimumSessionCode: huberaIdSessionMinimumCode,
    );
    expect(plan.action, HuberaIdLaunch.offerApk);
    expect(plan.silentInstall, isFalse);
    expect(plan.clearSessionOnUpdate, isFalse);
  });

  test('ID absent : proposition, pas une install silencieuse', () {
    final plan = planHuberaIdLaunch(android: true, idInstalled: false);
    expect(plan.action, HuberaIdLaunch.offerApk);
    expect(plan.silentInstall, isFalse);
  });

  test('iOS : aucun binaire, pas de fiche inventée', () {
    final plan = planHuberaIdLaunch(android: false, idInstalled: false);
    expect(plan.action, HuberaIdLaunch.noIosBinary);
    expect(plan.silentInstall, isFalse);
  });

  test('accepte seulement l’APK officielle cloud.hubera.id', () {
    expect(
      officialIdApkUrl({
        'canonical': {
          'package': 'cloud.hubera.id',
          'apk_url': 'https://id.hubera.cloud/hubera-id.apk',
        },
      }),
      'https://id.hubera.cloud/hubera-id.apk',
    );
    expect(
      officialIdApkUrl({
        'package': 'cloud.hubera.docs',
        'apk_url': 'https://id.hubera.cloud/docs.apk',
      }),
      isNull,
    );
    expect(
      officialIdApkUrl({
        'package': 'cloud.hubera.id',
        'apk_url': 'https://id.hubera.cloud/',
      }),
      isNull,
    );
  });
}
