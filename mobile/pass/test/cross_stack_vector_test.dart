/// Test d'interopérabilité **web ⇄ mobile** : vérifie que le port Dart de
/// `pass-crypto` produit les MÊMES sorties qu'attendues par le vecteur figé
/// dans `frontend/packages/pass-crypto/src/__tests__/vectors.test.ts`.
///
/// Si ce test casse :
///   - SOIT une dépendance Dart (`cryptography`, `cbor`) a changé sa sortie
///     d'Argon2id / HKDF / XChaCha20-Poly1305 / CBOR ;
///   - SOIT le format `EnvelopeV1` a évolué côté web sans que le port
///     mobile ait été aligné.
/// → Tous les coffres existants devenir illisibles côté mobile sans une
///   migration explicite (cf. PASS-CRYPTO § 9 lazy-migration).
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:cloudity_pass/features/pass_crypto.dart';
import 'package:flutter_test/flutter_test.dart';

const String _kMasterPassword = 'cloudity-vector-master-2026';
final Uint8List _kSaltUser = Uint8List.fromList(<int>[
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
]);
const String _kVaultId = '00000000-0000-4000-8000-000000000001';

/// Profil Argon2id de test (cf. `_helpers.ts` côté web : `t=1, m=8 KiB, p=1`).
/// **Non sécurisé** — uniquement pour vecteurs déterministes.
const Argon2idParams _kArgon2idTest = Argon2idParams(
  memoryKib: 8,
  iterations: 1,
  parallelism: 1,
);

/// Hex MK attendu (calculé une fois côté web ; voir `vectors.test.ts`).
const String _kExpectedMkHex =
    '46d34f0b75afe0056348aef427b1082bf246a4a216c12fa1ca66086f8440a917';

/// Hex VK attendu pour MK + VAULT_ID.
const String _kExpectedVkHex =
    'bef6308f2247fa485ffb1845da1293fc0d5ed80aba4882d173bcdce7454d7230';

/// Enveloppe stable (CBOR + base64url) produite côté web avec les entrées
/// canoniques + RNG xorshift32 seedé à 0xdeadc0de.
const String _kExpectedEnvelopeB64url =
    'uQALYXYBY2FsZ3F4Y2hhY2hhMjBwb2x5MTMwNWNrZGa5AARkbmFtZWhhcmdvbjJpZGF0AWFtCGFwAWlzYWx0X3VzZXLYQFABAgMEBQYHCAkKCwwNDg8QaHZhdWx0X2lkeCQwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDFnaXRlbV9pZHgkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyZHdyYXDYQFgw09_N2EfQ7v9TENRAERjKR7k4hTgKQYlG3ZI8JZsI_HwHHaJ4e6ZFmTmaqnWVr9ObYmN02EBY4wvr1MkqmFaK1yaISHymP24lve4uPV7k6PBQ7sJXb4jnhn3z0OtMSOiA06sdTWGh2oigAfBG2I9s-gwAfJWbY_8HgF2GzLDXkAwbFH5mxns68fbctGHdaN7tG35GcKMrqVbsJACfl84HotHG87ikHONsU3TraQ5dKX7tLSP4QnkE15UGUYrWz82cYmBcFNfMkNl6q_40pm4Zwkaq7j0D6oW9v3O8PzdulOFySCjTeBPxv98mWyt2hgRP5b2o9zUfCSRq0nBZNYNIbgx5MfS084h8c2azAaKWP62d4XdIgpZnYx6DZ25vbmNlX3fYQFgY7KQLLxM7WpsFxTSr0ZDJTHmRY9T3y5-XZ25vbmNlX2PYQFgYcBtUIrUeaPKoBldB0D36LZnfgCMJudyAY2FhZNhAWF4wMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDE6MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyOnYxOnhjaGFjaGEyMHBvbHkxMzA1';

String _toHex(Uint8List bytes) {
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

void main() {
  group('Cross-stack vector (web → mobile)', () {
    test('Argon2id(MASTER_PASSWORD, SALT, t=1 m=8 p=1) reproduit MK web',
        () async {
      final mk = await deriveMasterKey(
        password: _kMasterPassword,
        saltUser: _kSaltUser,
        params: _kArgon2idTest,
      );
      expect(mk.length, 32);
      expect(_toHex(mk), _kExpectedMkHex,
          reason: 'MK Dart doit correspondre au vecteur figé côté web '
              '(`vectors.test.ts`). Si ce test casse, vérifier la dépendance '
              '`cryptography` Dart.');
    });

    test('HKDF-SHA-256(MK, vault-key, VAULT_ID) reproduit VK web', () async {
      final mk = await deriveMasterKey(
        password: _kMasterPassword,
        saltUser: _kSaltUser,
        params: _kArgon2idTest,
      );
      final vk = await deriveVaultKey(masterKey: mk, vaultId: _kVaultId);
      expect(vk.length, 32);
      expect(_toHex(vk), _kExpectedVkHex);
    });

    test('décode l\'enveloppe figée et retrouve le plaintext exact', () async {
      final mk = await deriveMasterKey(
        password: _kMasterPassword,
        saltUser: _kSaltUser,
        params: _kArgon2idTest,
      );
      final plain = await decryptItemFromVault(
        envelopeB64u: _kExpectedEnvelopeB64url,
        masterKey: mk,
        expectedVaultId: _kVaultId,
      );
      expect(plain.schema, 1);
      expect(plain.type, 'login');
      expect(plain.title, 'Vector test');
      expect(plain.url, 'https://example.org/login');
      expect(plain.username, 'vector@example.org');
      expect(plain.password, 'vector-fixed-password');
      expect(plain.notes, 'Vecteur stable — ne pas modifier sans bump v: 2.');
      expect(plain.tags, ['vector']);
    });

    test('refuse une enveloppe pour un mauvais vault_id', () async {
      final mk = await deriveMasterKey(
        password: _kMasterPassword,
        saltUser: _kSaltUser,
        params: _kArgon2idTest,
      );
      expect(
        () => decryptItemFromVault(
          envelopeB64u: _kExpectedEnvelopeB64url,
          masterKey: mk,
          expectedVaultId: 'wrong-vault-id',
        ),
        throwsA(isA<FormatException>()),
      );
    });

    test('refuse l\'enveloppe avec une MK incorrecte (auth tag invalide)',
        () async {
      final wrongMk = Uint8List.fromList(utf8.encode('not-the-real-mk-32-bytes!!!12345')
          .sublist(0, 32));
      expect(
        () => decryptItemFromVault(
          envelopeB64u: _kExpectedEnvelopeB64url,
          masterKey: wrongMk,
          expectedVaultId: _kVaultId,
        ),
        throwsA(anything),
      );
    });
  });
}
