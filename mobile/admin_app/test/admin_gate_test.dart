import 'package:admin_app/api/admin_api.dart';
import 'package:admin_app/auth/admin_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('seul un 200 de l’API admin ouvre le tableau', () {
    expect(adminEntryFromStatus(200), AdminEntry.open);
    expect(adminEntryFromStatus(403), AdminEntry.denied);
    expect(adminEntryFromStatus(401), AdminEntry.unresolved);
    expect(adminEntryFromStatus(500), AdminEntry.unresolved);
    expect(adminEntryFromStatus(null), AdminEntry.unresolved);
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
