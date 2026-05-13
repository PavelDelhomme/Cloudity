/// Port Dart **lecture seule** de `frontend/packages/pass-crypto`.
///
/// Décode l'enveloppe `EnvelopeV1` (CBOR + base64url) émise par l'app web et
/// déchiffre l'item localement. **Ne génère PAS** de nouvelles enveloppes
/// (édition mobile = L2 sprint Pass, J+1..J+5).
///
/// Spec source de vérité : `docs/securite/PASS-CRYPTO.md`.
/// Tests de référence : `frontend/packages/pass-crypto/src/__tests__/`.
///
/// Sécurité :
///  - La clé maître (32 oct) reste **uniquement en mémoire Dart** (jamais
///    `flutter_secure_storage` brute, sauf wrappée par biométrie via
///    `local_auth`).
///  - Hiérarchie : `MK = Argon2id(password, salt_user)` puis
///    `VK = HKDF(MK, info="cloudity-pass/v1/vault-key:" + vault_id, salt=32×0x00)` puis
///    `IK_item = open(wrap, VK, nonce_w, aad="wrap:"+aad)` puis
///    `plaintext = open(ct, IK_item, nonce_c, aad)`.
///  - À la fermeture du coffre : `zeroize` chaque buffer secret (best-effort
///    en Dart : pas de garantie GC).
///
/// Implémentation découpée en `part` pour limiter la taille des fichiers
/// (`pass_crypto_types.dart`, `pass_crypto_kdf.dart`, `pass_crypto_envelope.dart`,
/// `pass_crypto_decrypt.dart`).
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:cbor/cbor.dart';
import 'package:cryptography/cryptography.dart';

part 'pass_crypto_types.dart';
part 'pass_crypto_kdf.dart';
part 'pass_crypto_envelope.dart';
part 'pass_crypto_decrypt.dart';
