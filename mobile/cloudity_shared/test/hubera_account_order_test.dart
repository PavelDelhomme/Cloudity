import 'package:cloudity_shared/auth/hubera_account_order.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('le compte Music reste premier quand on en ajoute un', () {
    final pin = rememberHuberaDeviceAccount(
      existingPin: null,
      emails: ['compte-ajoute', 'deja-sur-appareil'],
      sources: ['cloud.hubera.mail', 'cloud.hubera.music'],
      updatedAt: [99, 10],
    );
    final ordered = placeHuberaAccountFirst(
      ['compte-ajoute', 'deja-sur-appareil'],
      pin,
      (email) => email,
    );
    expect(pin, 'deja-sur-appareil');
    expect(ordered, ['deja-sur-appareil', 'compte-ajoute']);
  });

  test('l’épingle ne bouge pas et ne retire pas l’autre compte', () {
    final pin = rememberHuberaDeviceAccount(
      existingPin: 'deja-sur-appareil',
      emails: ['compte-ajoute', 'deja-sur-appareil'],
      sources: ['cloud.hubera.mail', 'cloud.hubera.mail'],
      updatedAt: [10, 80],
    );
    final ordered = placeHuberaAccountFirst(
      ['compte-ajoute', 'deja-sur-appareil'],
      pin,
      (email) => email,
    );
    expect(ordered.first, 'deja-sur-appareil');
    expect(ordered, hasLength(2));
  });

  test('Admin n’auto-connecte pas quand plusieurs comptes sont listés', () {
    expect(
      adminShouldAutoPasskey(chooserRequested: false, listedAccounts: 2),
      isFalse,
    );
    expect(
      adminShouldAutoPasskey(chooserRequested: true, listedAccounts: 0),
      isFalse,
    );
    expect(
      adminShouldAutoPasskey(chooserRequested: false, listedAccounts: 0),
      isTrue,
    );
  });

  test('le jeton appliqué est celui du compte choisi', () {
    expect(
      sessionMatchesChosenAccount(
        chosenEmail: 'choisi@hubera.cloud',
        tokenEmail: 'autre@hubera.cloud',
      ),
      isFalse,
    );
    expect(
      sessionMatchesChosenAccount(
        chosenEmail: 'Choisi@Hubera.cloud',
        tokenEmail: 'choisi@hubera.cloud',
      ),
      isTrue,
    );
  });

  test('une passkey déjà lancée ne remplace pas le compte tapé', () {
    expect(passkeyMayApply(passkeyGeneration: 1, pickGeneration: 2), isFalse);
    expect(passkeyMayApply(passkeyGeneration: 3, pickGeneration: 3), isTrue);
  });

  test('les comptes appareil et broker sont fusionnés par e-mail', () {
    final merged = mergeAccountsWithTokens(
      ['ancien@x'],
      ['ancien@x', 'autre@x', 'vide@x'],
      emailOf: (email) => email,
      hasToken: (email) => email != 'vide@x',
      updatedAtOf: (email) => email.startsWith('autre') ? 5 : 1,
    );
    expect(merged.toSet(), {'ancien@x', 'autre@x'});
  });
}
