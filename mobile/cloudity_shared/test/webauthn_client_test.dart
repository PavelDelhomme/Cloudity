import 'package:test/test.dart';

import 'package:cloudity_shared/webauthn_client.dart';

void main() {
  test('CloudityWebAuthnException affiche le message', () {
    final err = CloudityWebAuthnException('échec test');
    expect(err.toString(), 'échec test');
  });
}
