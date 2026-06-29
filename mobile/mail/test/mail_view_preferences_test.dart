import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cloudity_mail/mail_view_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  test('persiste boîte et dossier par email', () async {
    await MailViewPreferences.save(
      email: 'User@Test.com',
      accountId: 42,
      folder: 'sent',
    );
    final loaded = await MailViewPreferences.load('user@test.com');
    expect(loaded.accountId, 42);
    expect(loaded.folder, 'sent');
  });

  test('dossier invalide retombe sur inbox', () async {
    await MailViewPreferences.save(
      email: 'a@test.com',
      accountId: 1,
      folder: 'x' * 600,
    );
    final loaded = await MailViewPreferences.load('a@test.com');
    expect(loaded.folder, 'inbox');
  });
}
