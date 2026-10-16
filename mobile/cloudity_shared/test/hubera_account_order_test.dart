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
}
