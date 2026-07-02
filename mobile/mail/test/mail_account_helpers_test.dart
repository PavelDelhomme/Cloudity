import 'package:flutter_test/flutter_test.dart';
import 'package:cloudity_mail/features/mail_account_helpers.dart';

void main() {
  test('mailAccountHasSyncIssue détecte last_sync_error et imap_auth_ready', () {
    expect(mailAccountHasSyncIssue({'imap_auth_ready': true}), isFalse);
    expect(
      mailAccountHasSyncIssue({
        'imap_auth_ready': false,
      }),
      isTrue,
    );
    expect(
      mailAccountHasSyncIssue({
        'imap_auth_ready': true,
        'last_sync_error': 'Identifiants refusés',
      }),
      isTrue,
    );
  });

  test('mailAccountLabel préfère le libellé au email', () {
    expect(
      mailAccountLabel({'label': ' Perso ', 'email': 'a@test.com'}),
      'Perso',
    );
    expect(mailAccountLabel({'email': 'a@test.com'}), 'a@test.com');
  });
}
