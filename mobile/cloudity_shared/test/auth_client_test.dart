import 'package:flutter_test/flutter_test.dart';
import 'package:cloudity_shared/auth/auth_client.dart';
import 'package:cloudity_shared/auth/auth_exception.dart';

void main() {
  test('CloudityAuthClient normalise le slash final', () {
    final api = CloudityAuthClient('http://127.0.0.1:6002/');
    expect(api.baseUrl, 'http://127.0.0.1:6002');
  });

  test('AuthException toString = message', () {
    expect(AuthException('boom').toString(), 'boom');
  });
}
