import 'package:flutter_test/flutter_test.dart';
import 'package:cloudity_mail/features/html_to_readable.dart';

void main() {
  test('htmlToReadable retire les balises et décode les entités', () {
    expect(
      htmlToReadable('<p>Bonjour&nbsp;<b>Paul</b></p><br>suite'),
      'Bonjour Paul\n\nsuite',
    );
  });
}
