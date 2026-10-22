import 'package:admin_app/api/admin_api.dart';
import 'package:admin_app/auth/admin_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('seul un jeton admin encore valide ouvre l’accueil', () {
    expect(adminOpensHome(role: 'admin', accessStillValid: true), isTrue);
    expect(adminOpensHome(role: 'admin', accessStillValid: false), isFalse);
    expect(adminOpensHome(role: 'user', accessStillValid: true), isFalse);
    expect(adminOpensHome(role: null, accessStillValid: true), isFalse);
    expect(adminOpensHome(role: '', accessStillValid: true), isFalse);
  });

  test('un 403 renvoie vers la connexion, un autre échec non', () {
    expect(adminAccessForbidden(AdminApiException('Accès admin refusé (403)')), isTrue);
    expect(adminAccessForbidden(AdminApiException('Accès admin refusé (401)')), isFalse);
    expect(adminAccessForbidden(Exception('liste indisponible')), isFalse);
  });

  test('le refus pose un message court, sans adresse en dur', () {
    adminLoginNotice.value = null;
    adminStayOnLogin();
    expect(adminLoginNotice.value, adminDeniedMessage);
    expect(adminDeniedMessage.contains('@'), isFalse);
    adminClearLoginNotice();
    expect(adminLoginNotice.value, isNull);
  });
}
