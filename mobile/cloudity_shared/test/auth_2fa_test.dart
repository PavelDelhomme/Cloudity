/// Tests unitaires de [Auth2FAClient] et [looksLikeRecoveryCode] — utilisent
/// `http.MockClient` pour simuler `/auth/2fa/verify` sans démarrer de serveur.
library;

import 'dart:convert';

import 'package:cloudity_shared/auth_2fa.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
  group('looksLikeRecoveryCode', () {
    test('TOTP 6 chiffres → false', () {
      expect(looksLikeRecoveryCode('123456'), isFalse);
    });
    test('Recovery 12 alphanumérique → true', () {
      expect(looksLikeRecoveryCode('ABCD1234EFGH'), isTrue);
    });
    test('Recovery avec tirets → true', () {
      expect(looksLikeRecoveryCode('ABCD-1234-EFGH'), isTrue);
    });
    test('Trop court → false', () {
      expect(looksLikeRecoveryCode('ABCD-1234'), isFalse);
    });
    test('Caractères non alphanumériques → false', () {
      expect(looksLikeRecoveryCode('ABCD@1234EFGH'), isFalse);
    });
  });

  group('Auth2FAClient.verify', () {
    test('200 → renvoie access/refresh + flags', () async {
      final mock = MockClient((req) async {
        expect(req.url.path, '/auth/2fa/verify');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['email'], 'alice@example.com');
        expect(body['tenant_id'], '1');
        expect(body['code'], '123456');
        return http.Response(
          jsonEncode({
            'access_token': 'access-jwt',
            'refresh_token': 'refresh-tok',
            'expires_in': 900,
            'used_recovery_code': false,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final client = Auth2FAClient('http://localhost:6080', client: mock);
      final res = await client.verify(
        email: 'alice@example.com',
        tenantId: '1',
        code: '123456',
      );
      expect(res.accessToken, 'access-jwt');
      expect(res.refreshToken, 'refresh-tok');
      expect(res.expiresIn, 900);
      expect(res.usedRecoveryCode, isFalse);
      expect(res.recoveryCodes, isEmpty);
    });

    test('200 avec recovery_codes → propage la liste', () async {
      final mock = MockClient((req) async {
        return http.Response(
          jsonEncode({
            'access_token': 'a',
            'refresh_token': 'r',
            'expires_in': 900,
            'used_recovery_code': false,
            'recovery_codes': ['code-1', 'code-2'],
          }),
          200,
        );
      });
      final client = Auth2FAClient('http://localhost:6080/', client: mock);
      final res = await client.verify(
        email: 'a@b.c',
        tenantId: '1',
        code: '654321',
      );
      expect(res.recoveryCodes, ['code-1', 'code-2']);
    });

    test('401 → Auth2FAException avec message lisible', () async {
      final mock = MockClient((req) async {
        return http.Response(
          jsonEncode({'error': 'invalid code'}),
          401,
        );
      });
      final client = Auth2FAClient('http://localhost:6080', client: mock);
      expect(
        () => client.verify(email: 'a@b.c', tenantId: '1', code: '000000'),
        throwsA(isA<Auth2FAException>()),
      );
    });

    test('Code vide → exception avant appel réseau', () async {
      var called = false;
      final mock = MockClient((req) async {
        called = true;
        return http.Response('{}', 200);
      });
      final client = Auth2FAClient('http://localhost:6080', client: mock);
      expect(
        () => client.verify(email: 'a@b.c', tenantId: '1', code: '   '),
        throwsA(isA<Auth2FAException>()),
      );
      expect(called, isFalse);
    });

    test('500 → Auth2FAException', () async {
      final mock = MockClient((req) async {
        return http.Response('boom', 500);
      });
      final client = Auth2FAClient('http://localhost:6080', client: mock);
      expect(
        () => client.verify(email: 'a@b.c', tenantId: '1', code: '123456'),
        throwsA(isA<Auth2FAException>()),
      );
    });

    test('200 sans access_token → Auth2FAException', () async {
      final mock = MockClient((req) async {
        return http.Response(jsonEncode({'foo': 'bar'}), 200);
      });
      final client = Auth2FAClient('http://localhost:6080', client: mock);
      expect(
        () => client.verify(email: 'a@b.c', tenantId: '1', code: '123456'),
        throwsA(isA<Auth2FAException>()),
      );
    });
  });
}
