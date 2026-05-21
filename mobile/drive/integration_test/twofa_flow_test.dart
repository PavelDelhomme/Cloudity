import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:crypto/crypto.dart';

import 'package:cloudity_drive/main.dart' as app;

const String kE2eGateway = String.fromEnvironment(
  'CLOUDITY_E2E_GATEWAY',
  defaultValue: '',
);
const String kE2eEmail = String.fromEnvironment(
  'CLOUDITY_E2E_EMAIL',
  defaultValue: '',
);
const String kE2ePassword = String.fromEnvironment(
  'CLOUDITY_E2E_PASSWORD',
  defaultValue: '',
);
const String kE2eTenant = String.fromEnvironment(
  'CLOUDITY_E2E_TENANT',
  defaultValue: '1',
);
const String kE2e2faCode = String.fromEnvironment(
  'CLOUDITY_E2E_2FA_CODE',
  defaultValue: '',
);
const String kE2e2faSecret = String.fromEnvironment(
  'CLOUDITY_E2E_TOTP_SECRET',
  defaultValue: '',
);

const Key kFiles = ValueKey('cloudity_drive_files');
const Key kGateway = ValueKey('cloudity_drive_login_gateway');
const Key kEmail = ValueKey('cloudity_drive_login_email');
const Key kPassword = ValueKey('cloudity_drive_login_password');
const Key kTenant = ValueKey('cloudity_drive_login_tenant');
const Key kSubmit = ValueKey('cloudity_drive_login_submit');
const Key k2faCode = ValueKey('cloudity_drive_login_2fa_code');
const Key k2faSubmit = ValueKey('cloudity_drive_login_2fa_submit');

bool _onLogin(WidgetTester tester) =>
    find.text('Connexion — Cloudity Drive').evaluate().isNotEmpty;

bool _on2FA(WidgetTester tester) =>
    find.text('Vérification 2FA — Cloudity Drive').evaluate().isNotEmpty;

bool _onFiles(WidgetTester tester) => find.byKey(kFiles).evaluate().isNotEmpty;

List<int> _base32Decode(String input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var buffer = 0;
  var bitsLeft = 0;
  final out = <int>[];
  for (final codeUnit in input.toUpperCase().codeUnits) {
    final char = String.fromCharCode(codeUnit);
    if (char == '=' || char == ' ' || char == '-') continue;
    final value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      out.add((buffer >> bitsLeft) & 0xff);
    }
  }
  return out;
}

String _freshTotpCode() {
  if (kE2e2faSecret.isEmpty) return kE2e2faCode;
  final counter = DateTime.now().millisecondsSinceEpoch ~/ 30000;
  final msg = ByteData(8)..setUint64(0, counter);
  final digest = Hmac(
    sha1,
    _base32Decode(kE2e2faSecret),
  ).convert(msg.buffer.asUint8List()).bytes;
  final offset = digest.last & 0x0f;
  final binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
  return (binary % 1000000).toString().padLeft(6, '0');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'login compte 2FA : mot de passe puis TOTP → Drive',
    (tester) async {
      await tester.pumpWidget(const app.CloudityDriveApp());
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 250));
        if (_onLogin(tester) || _on2FA(tester) || _onFiles(tester)) break;
      }

      if (_onFiles(tester)) return;

      if (find.byKey(kGateway).evaluate().isNotEmpty) {
        await tester.enterText(find.byKey(kGateway), kE2eGateway);
      }
      await tester.enterText(find.byKey(kEmail), kE2eEmail);
      await tester.enterText(find.byKey(kPassword), kE2ePassword);
      if (find.byKey(kTenant).evaluate().isNotEmpty) {
        await tester.enterText(find.byKey(kTenant), kE2eTenant);
      }
      await tester.pump();
      await tester.tap(find.byKey(kSubmit));
      await tester.pump();

      for (var i = 0; i < 120; i++) {
        await tester.pump(const Duration(milliseconds: 500));
        if (_on2FA(tester) || _onFiles(tester)) break;
      }

      if (!_onFiles(tester)) {
        expect(
          _on2FA(tester),
          isTrue,
          reason: 'Écran 2FA attendu après mot de passe',
        );
        await tester.enterText(find.byKey(k2faCode), '000000');
        await tester.pump();
        await tester.tap(find.byKey(k2faSubmit));
        await tester.pump();
        for (var i = 0; i < 20; i++) {
          await tester.pump(const Duration(milliseconds: 250));
          if (_on2FA(tester)) break;
        }
        expect(
          _on2FA(tester),
          isTrue,
          reason: 'Un code 2FA invalide ne doit pas ouvrir la session',
        );
        await tester.enterText(find.byKey(k2faCode), _freshTotpCode());
        await tester.pump();
        await tester.tap(find.byKey(k2faSubmit));
        await tester.pump();
      }

      for (var i = 0; i < 240; i++) {
        await tester.pump(const Duration(milliseconds: 500));
        if (_onFiles(tester)) break;
      }

      expect(find.byKey(kFiles), findsOneWidget);
    },
    skip:
        kE2eGateway.isEmpty ||
        kE2eEmail.isEmpty ||
        kE2ePassword.isEmpty ||
        (kE2e2faCode.isEmpty && kE2e2faSecret.isEmpty),
  );
}
