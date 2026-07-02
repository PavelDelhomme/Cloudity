import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cloudity_shared/mail_view_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  test('persiste boîte et dossier par tenant + email', () async {
    await MailViewPreferences.save(
      email: 'User@Test.com',
      tenantId: 2,
      accountId: 42,
      folder: 'sent',
    );
    final loaded = await MailViewPreferences.load(
      email: 'user@test.com',
      tenantId: 2,
    );
    expect(loaded.accountId, 42);
    expect(loaded.folder, 'sent');
  });

  test('migre l’ancienne clé mobile (email seul)', () async {
    SharedPreferences.setMockInitialValues({
      'cloudity.mail.view.v1:user@test.com':
          '{"accountId":7,"folder":"scheduled"}',
    });
    final loaded = await MailViewPreferences.load(
      email: 'user@test.com',
      tenantId: 1,
    );
    expect(loaded.accountId, 7);
    expect(loaded.folder, 'scheduled');
  });

  test('dossier invalide retombe sur inbox', () async {
    await MailViewPreferences.save(
      email: 'a@test.com',
      tenantId: 1,
      accountId: 1,
      folder: 'x' * 600,
    );
    final loaded = await MailViewPreferences.load(
      email: 'a@test.com',
      tenantId: 1,
    );
    expect(loaded.folder, 'inbox');
  });
}
