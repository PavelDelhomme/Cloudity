import 'package:cloudity_shared/auth/device_account_plan.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('un jeton ouvre le compte sans remplir l’e-mail', () {
    final plan = planDeviceAccount(
      email: 'compte-deja-present',
      accessToken: 'access',
      refreshToken: '',
    );
    expect(plan.action, DeviceAccountAction.open);
    expect(plan.fillsEmailField, isFalse);

    final refreshOnly = planDeviceAccount(
      email: 'compte-deja-present',
      accessToken: '',
      refreshToken: 'refresh',
    );
    expect(refreshOnly.action, DeviceAccountAction.open);
    expect(refreshOnly.fillsEmailField, isFalse);
  });

  test('sans jeton, l’adresse connue préremplit la connexion', () {
    final plan = planDeviceAccount(
      email: 'compte-deja-present',
      accessToken: '',
      refreshToken: '',
    );
    expect(plan.action, DeviceAccountAction.password);
    expect(plan.fillsEmailField, isTrue);
  });

  test('sans adresse, le formulaire reste vide', () {
    final plan = planDeviceAccount(
      email: '  ',
      accessToken: '',
      refreshToken: '',
    );
    expect(plan.action, DeviceAccountAction.password);
    expect(plan.fillsEmailField, isFalse);
  });
}
