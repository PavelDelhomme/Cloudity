import 'package:cloudity_shared/auth/hubera_id_renew.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const dead = IdSessionView(known: true);

  test('un access encore valide ne demande rien', () {
    expect(
      planIdRenew(
        accessStillValid: true,
        localRefresh: 'old',
        expectedEmail: 'a@example.com',
        id: dead,
        idAccessUsable: false,
        idAccessEmail: '',
      ),
      IdRenewChoice.keepLocal,
    );
  });

  test('Hubera ID frais remplace le refresh local déjà tourné', () {
    expect(
      planIdRenew(
        accessStillValid: false,
        localRefresh: 'replaced',
        expectedEmail: 'a@example.com',
        id: const IdSessionView(
          known: true,
          access: 'fresh-access',
          refresh: 'current',
        ),
        idAccessUsable: true,
        idAccessEmail: 'a@example.com',
      ),
      IdRenewChoice.useId,
    );
  });

  test('le jeton du compte B est refusé', () {
    expect(
      planIdRenew(
        accessStillValid: false,
        localRefresh: 'local',
        expectedEmail: 'a@example.com',
        id: const IdSessionView(known: true, access: 'other', refresh: 'other'),
        idAccessUsable: true,
        idAccessEmail: 'b@example.com',
      ),
      IdRenewChoice.chooser,
    );
  });

  test('session ID morte : pas de nouvel envoi du vieux refresh', () {
    expect(
      planIdRenew(
        accessStillValid: false,
        localRefresh: 'replaced',
        expectedEmail: 'a@example.com',
        id: dead,
        idAccessUsable: false,
        idAccessEmail: '',
      ),
      IdRenewChoice.chooser,
    );
  });

  test('ID absent : le refresh local reste le repli', () {
    expect(
      planIdRenew(
        accessStillValid: false,
        localRefresh: 'local',
        expectedEmail: 'a@example.com',
        id: null,
        idAccessUsable: false,
        idAccessEmail: '',
      ),
      IdRenewChoice.askServer,
    );
  });

  test('ID injoignable ne ressemble pas à une session morte', () {
    expect(
      planIdRenew(
        accessStillValid: false,
        localRefresh: 'local',
        expectedEmail: 'a@example.com',
        id: const IdSessionView(known: true, access: 'stale', refresh: 'still'),
        idAccessUsable: false,
        idAccessEmail: 'a@example.com',
      ),
      IdRenewChoice.hold,
    );
  });
}
