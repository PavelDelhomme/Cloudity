import 'dart:convert';

import 'package:admin_app/auth/admin_refresh.dart';
import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter_test/flutter_test.dart';

String _jwt({required int exp, String email = 'chosen@example.com'}) {
  String part(String raw) {
    return base64Url.encode(utf8.encode(raw)).replaceAll('=', '');
  }

  final header = part('{"alg":"none"}');
  final payload = part('{"exp":$exp,"email":"$email","role":"admin"}');
  return '$header.$payload.x';
}

void main() {
  final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
  final fresh = _jwt(exp: now + 7200);
  final expiring = _jwt(exp: now + 60);

  test('un access encore valide ne déclenche pas de refresh', () async {
    var calls = 0;
    final result = await recoverAdminRefresh(
      access: fresh,
      refresh: 'current',
      expectedEmail: 'chosen@example.com',
      listCopies: () async => const [],
      refreshTokens: (access, refresh) async {
        calls++;
        return (access: access, refresh: refresh);
      },
    );
    expect(calls, 0);
    expect(result.openChooser, isFalse);
    expect(result.refresh, 'current');
  });

  test('un refresh valide du même compte remplace la session', () async {
    final result = await recoverAdminRefresh(
      access: expiring,
      refresh: 'dead',
      expectedEmail: 'chosen@example.com',
      listCopies: () async => [
        (email: 'other@example.com', refresh: 'foreign'),
        (email: 'chosen@example.com', refresh: 'alive'),
      ],
      refreshTokens: (access, refresh) async {
        if (refresh == 'foreign') {
          throw StateError('autre compte');
        }
        if (refresh == 'dead') {
          throw AuthException('Refresh (401): invalid or expired refresh token');
        }
        return (access: fresh, refresh: 'alive-rotated');
      },
    );
    expect(result.openChooser, isFalse);
    expect(result.access, fresh);
    expect(result.refresh, 'alive-rotated');
  });

  test('un refresh expiré ouvre le choix de compte, une seule fois par jeton', () async {
    final tried = <String>[];
    final result = await recoverAdminRefresh(
      access: expiring,
      refresh: 'dead',
      expectedEmail: 'chosen@example.com',
      listCopies: () async => [
        (email: 'chosen@example.com', refresh: 'dead'),
        (email: 'other@example.com', refresh: 'foreign'),
      ],
      refreshTokens: (access, refresh) async {
        tried.add(refresh);
        throw AuthException('Refresh (401): invalid or expired refresh token');
      },
    );
    expect(result.openChooser, isTrue);
    expect(tried, ['dead']);
  });

  test('une coupure réseau ne ressemble pas à un refresh expiré', () async {
    final result = await recoverAdminRefresh(
      access: expiring,
      refresh: 'current',
      expectedEmail: 'chosen@example.com',
      listCopies: () async => const [],
      refreshTokens: (access, refresh) async {
        throw Exception('Software caused connection abort');
      },
    );
    expect(result.openChooser, isFalse);
    expect(result.access, expiring);
    expect(adminRefreshTokenRejected(Exception('Software caused connection abort')), isFalse);
  });
}
