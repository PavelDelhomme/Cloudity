import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_mail/mail_validation.dart';

void main() {
  group('isValidRecipientEmail', () {
    test('accepte des adresses simples valides', () {
      expect(isValidRecipientEmail('a@b.co'), isTrue);
      expect(isValidRecipientEmail('  user@example.org  '), isTrue);
    });

    test('refuse les entrées invalides', () {
      expect(isValidRecipientEmail(''), isFalse);
      expect(isValidRecipientEmail(' '), isFalse);
      expect(isValidRecipientEmail('pas-email'), isFalse);
      expect(isValidRecipientEmail('@nodomain.fr'), isFalse);
      expect(isValidRecipientEmail('local@'), isFalse);
      expect(isValidRecipientEmail('local@nodot'), isFalse);
    });
  });
}
