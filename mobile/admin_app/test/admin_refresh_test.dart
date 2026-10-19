import 'dart:convert';

import 'package:admin_app/auth/admin_refresh.dart';
import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter_test/flutter_test.dart';

String _jwt({
  required int exp,
  String email = 'chosen@example.com',
  String role = 'admin',
}) {
  String part(String raw) {
    return base64Url.encode(utf8.encode(raw)).replaceAll('=', '');
  }

  final header = part('{"alg":"none"}');
  final payload = part('{"exp":$exp,"email":"$email","role":"$role"}');
  return '$header.$payload.x';
}

void main() {
  final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
  final fresh = _jwt(exp: now + 7200);
  final expiring = _jwt(exp: now + 60);

  test('rôle absent : renouveler, compte déjà admin : garder', () {
    expect(adminNeedsRoleRefresh(isAdmin: false, refresh: 'refresh'), isTrue);
    expect(adminNeedsRoleRefresh(isAdmin: true, refresh: 'refresh'), isFalse);
    expect(adminNeedsRoleRefresh(isAdmin: null, refresh: 'refresh'), isFalse);
    expect(adminNeedsRoleRefresh(isAdmin: false, refresh: '  '), isFalse);
  });

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

  test('un vieux rôle user cède devant une autre copie du même compte', () async {
    final userJwt = _jwt(exp: now + 7200, role: 'user');
    final adminJwt = _jwt(exp: now + 7200, role: 'admin');
    final tried = <String>[];
    final result = await resolveAdminTokens(
      access: userJwt,
      refresh: 'dead',
      expectedEmail: 'chosen@example.com',
      copies: [
        (email: 'other@example.com', access: adminJwt, refresh: 'foreign'),
        (email: 'chosen@example.com', access: userJwt, refresh: 'alive'),
      ],
      roleOf: (token) async => roleFromAccessToken(token) == 'admin',
      refreshTokens: (refresh) async {
        tried.add(refresh);
        if (refresh == 'foreign') {
          throw StateError('autre compte');
        }
        if (refresh == 'dead') {
          throw AuthException('Refresh (401): invalid or expired refresh token');
        }
        return (access: adminJwt, refresh: 'alive-rotated');
      },
    );
    expect(tried, ['dead', 'alive']);
    expect(result.isAdmin, isTrue);
    expect(result.access, adminJwt);
    expect(result.refresh, 'alive-rotated');
  });

  test('un JWT admin déjà là pour ce compte évite le refresh', () async {
    final userJwt = _jwt(exp: now + 7200, role: 'user');
    final adminJwt = _jwt(exp: now + 7200, role: 'admin');
    var calls = 0;
    final result = await resolveAdminTokens(
      access: userJwt,
      refresh: 'current',
      expectedEmail: 'chosen@example.com',
      copies: [
        (email: 'other@example.com', access: adminJwt, refresh: 'foreign'),
        (email: 'chosen@example.com', access: adminJwt, refresh: 'kept'),
      ],
      roleOf: (token) async => roleFromAccessToken(token) == 'admin',
      refreshTokens: (refresh) async {
        calls++;
        return (access: adminJwt, refresh: refresh);
      },
    );
    expect(calls, 0);
    expect(result.isAdmin, isTrue);
    expect(result.access, adminJwt);
    expect(result.refresh, 'kept');
  });

  test('un refresh mort cède devant un access encore valide relisant le rôle', () async {
    final userJwt = _jwt(exp: now + 7200, role: 'user');
    final adminJwt = _jwt(exp: now + 7200, role: 'admin');
    var renewed = 0;
    final result = await resolveAdminTokens(
      access: userJwt,
      refresh: 'dead',
      expectedEmail: 'chosen@example.com',
      copies: const [],
      roleOf: (token) async => roleFromAccessToken(token) == 'admin',
      refreshTokens: (refresh) async {
        throw AuthException('Refresh (401): invalid or expired refresh token');
      },
      renewAccess: (access) async {
        renewed++;
        return (access: adminJwt, refresh: 'fresh');
      },
    );
    expect(renewed, 1);
    expect(result.isAdmin, isTrue);
    expect(result.access, adminJwt);
    expect(result.refresh, 'fresh');
  });

  test('le compte labo reste refusé même après refresh', () async {
    final userJwt = _jwt(exp: now + 7200, email: 'lab@example.com', role: 'user');
    final result = await resolveAdminTokens(
      access: userJwt,
      refresh: 'lab-refresh',
      expectedEmail: 'lab@example.com',
      copies: [
        (email: 'lab@example.com', access: userJwt, refresh: 'lab-refresh'),
      ],
      roleOf: (token) async => roleFromAccessToken(token) == 'admin',
      refreshTokens: (refresh) async => (access: userJwt, refresh: refresh),
    );
    expect(result.isAdmin, isFalse);
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
