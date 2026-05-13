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
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:cbor/cbor.dart';
import 'package:cryptography/cryptography.dart';

/// Type d'item — aligné sur `ItemType` côté TS (`pass-crypto/src/types.ts`).
class PassItemTypes {
  PassItemTypes._();
  static const login = 'login';
  static const note = 'note';
  static const card = 'card';
  static const identity = 'identity';
  static const totp = 'totp';
  static const sshKey = 'ssh-key';
}

/// Plaintext d'un item Pass après décryptage.
///
/// Aligné sur `ItemPlaintextV1` (TS) : `{ schema, type, fields, notes, tags }`.
/// Les helpers (`title`, `username`, …) lisent les champs courants depuis
/// `fields` pour simplifier l'UI mobile.
class PassItemPlaintext {
  PassItemPlaintext({
    required this.schema,
    required this.type,
    required this.fields,
    this.notes,
    this.tags = const [],
  });

  final int schema;
  final String type;
  final Map<String, dynamic> fields;
  final String? notes;
  final List<String> tags;

  String? get title => fields['title']?.toString();
  String? get url => fields['url']?.toString();
  String? get username => fields['username']?.toString();
  String? get password => fields['password']?.toString();
  String? get totpUri => fields['totpUri']?.toString();
}

/// Profils Argon2id alignés sur `ARGON2ID_PROFILES` (TS).
class Argon2idParams {
  const Argon2idParams({
    required this.memoryKib,
    required this.iterations,
    required this.parallelism,
  });

  final int memoryKib;
  final int iterations;
  final int parallelism;

  /// `mobile-low` web : `t=3, m=64MiB, p=2` (PASS-CRYPTO § 3.3).
  static const mobileLow = Argon2idParams(
    memoryKib: 65536,
    iterations: 3,
    parallelism: 2,
  );

  /// `mobile-high` : 128 MiB, t=3, p=2.
  static const mobileHigh = Argon2idParams(
    memoryKib: 131072,
    iterations: 3,
    parallelism: 2,
  );

  /// `desktop` : 256 MiB, t=4, p=4 (rare en mobile, mais peut être
  /// rencontré si l'utilisateur a chiffré côté desktop).
  static const desktop = Argon2idParams(
    memoryKib: 262144,
    iterations: 4,
    parallelism: 4,
  );

  /// Lit les paramètres réellement utilisés depuis le champ `kdf` de
  /// l'enveloppe (priorité sur le profil par défaut local).
  static Argon2idParams fromKdfDescriptor(Map<String, dynamic> kdf) {
    final t = kdf['t'];
    final m = kdf['m'];
    final p = kdf['p'];
    if (t is! int || m is! int || p is! int) {
      throw const FormatException('kdf invalide : t/m/p doivent être des entiers');
    }
    return Argon2idParams(memoryKib: m, iterations: t, parallelism: p);
  }
}

/// Étiquettes HKDF — alignées sur `HKDF_LABELS` côté web (`hkdf.ts`).
class HkdfLabels {
  HkdfLabels._();
  static const vaultKey = 'cloudity-pass/v1/vault-key';
  static const wrapKey = 'cloudity-pass/v1/wrap-key';
  static const indexKey = 'cloudity-pass/v1/index-key';
}

/// Dérive la master key depuis password + salt utilisateur.
///
/// **Coûteux** (200 ms à 1 s sur mobile). Lance une seule fois par session.
Future<Uint8List> deriveMasterKey({
  required String password,
  required Uint8List saltUser,
  required Argon2idParams params,
}) async {
  if (password.isEmpty) {
    throw ArgumentError('mot de passe maître vide');
  }
  if (saltUser.length < 8) {
    throw ArgumentError('saltUser < 8 octets (16 recommandé, cf. PASS-CRYPTO § 4.1)');
  }
  final argon2 = Argon2id(
    memory: params.memoryKib,
    parallelism: params.parallelism,
    iterations: params.iterations,
    hashLength: 32,
  );
  final secret = SecretKey(utf8.encode(password));
  final mk = await argon2.deriveKey(secretKey: secret, nonce: saltUser);
  return Uint8List.fromList(await mk.extractBytes());
}

/// Dérive une sous-clé HKDF-SHA-256 (RFC 5869).
///
/// Salt = 32 octets de zéros (cf. `hkdf.ts` côté web), info = `label + ":" + context`.
Future<Uint8List> deriveSubKey({
  required Uint8List masterKey,
  required String label,
  required String context,
  int keyLen = 32,
}) async {
  if (keyLen < 16 || keyLen > 64) {
    throw ArgumentError('keyLen doit être dans [16, 64]');
  }
  final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: keyLen);
  final info = utf8.encode('$label:$context');
  final salt = Uint8List(32); // 32 zéros explicites
  final sk = await hkdf.deriveKey(
    secretKey: SecretKey(masterKey),
    nonce: salt,
    info: info,
  );
  return Uint8List.fromList(await sk.extractBytes());
}

/// Helper : `VK = HKDF(MK, label=vaultKey, context=vault_id)`.
Future<Uint8List> deriveVaultKey({
  required Uint8List masterKey,
  required String vaultId,
}) {
  return deriveSubKey(
    masterKey: masterKey,
    label: HkdfLabels.vaultKey,
    context: vaultId,
  );
}

/// Décode base64url **sans padding** (RFC 4648 § 5).
Uint8List fromBase64Url(String s) {
  final clean = s.replaceAll(RegExp(r'=+$'), '');
  final pad = '=' * ((4 - (clean.length % 4)) % 4);
  return base64Url.decode(clean + pad);
}

Uint8List _bytesFromCbor(dynamic v) {
  if (v is CborBytes) return Uint8List.fromList(v.bytes);
  throw const FormatException('Champ CBOR attendu : bytes');
}

String _stringFromCbor(dynamic v) {
  if (v is CborString) return v.toString();
  throw const FormatException('Champ CBOR attendu : string');
}

int _intFromCbor(dynamic v) {
  if (v is CborInt) return v.toInt();
  throw const FormatException('Champ CBOR attendu : int');
}

Map<String, dynamic> _mapFromCbor(CborMap m) {
  final out = <String, dynamic>{};
  m.forEach((k, v) {
    if (k is CborString) out[k.toString()] = v;
  });
  return out;
}

dynamic _unwrapCbor(dynamic v) {
  if (v is CborString) return v.toString();
  if (v is CborInt) return v.toInt();
  if (v is CborBool) return v.value;
  if (v is CborNull) return null;
  if (v is CborFloat) return v.value;
  if (v is CborBytes) return Uint8List.fromList(v.bytes);
  if (v is CborList) return v.map(_unwrapCbor).toList();
  if (v is CborMap) {
    final out = <String, dynamic>{};
    v.forEach((k, val) {
      final key = k is CborString ? k.toString() : k.toString();
      out[key] = _unwrapCbor(val);
    });
    return out;
  }
  return v;
}

/// Représentation Dart du `EnvelopeV1`.
class PassEnvelopeV1 {
  PassEnvelopeV1({
    required this.alg,
    required this.kdf,
    required this.saltUser,
    required this.vaultId,
    required this.itemId,
    required this.wrap,
    required this.ct,
    required this.nonceW,
    required this.nonceC,
    required this.aad,
  });

  final String alg; // toujours "xchacha20poly1305" en v1
  final Map<String, dynamic> kdf; // { name: 'argon2id', t, m, p }
  final Uint8List saltUser;
  final String vaultId;
  final String itemId;
  final Uint8List wrap;
  final Uint8List ct;
  final Uint8List nonceW;
  final Uint8List nonceC;
  final Uint8List aad;

  static PassEnvelopeV1 decode(String envelopeB64u) {
    final cborBytes = fromBase64Url(envelopeB64u);
    final decoded = cbor.decode(cborBytes);
    if (decoded is! CborMap) {
      throw const FormatException("Envelope: pas un CBOR map");
    }
    final m = _mapFromCbor(decoded);
    if (_intFromCbor(m['v']) != 1) {
      throw const FormatException("Envelope: version inattendue (attendu v=1)");
    }
    final alg = _stringFromCbor(m['alg']);
    if (alg != 'xchacha20poly1305') {
      throw FormatException("Envelope: algo non supporté ($alg)");
    }
    final kdfRaw = m['kdf'];
    if (kdfRaw is! CborMap) {
      throw const FormatException("Envelope: kdf manquant");
    }
    final kdfMap = <String, dynamic>{};
    _mapFromCbor(kdfRaw).forEach((k, v) {
      kdfMap[k] = _unwrapCbor(v);
    });
    return PassEnvelopeV1(
      alg: alg,
      kdf: kdfMap,
      saltUser: _bytesFromCbor(m['salt_user']),
      vaultId: _stringFromCbor(m['vault_id']),
      itemId: _stringFromCbor(m['item_id']),
      wrap: _bytesFromCbor(m['wrap']),
      ct: _bytesFromCbor(m['ct']),
      nonceW: _bytesFromCbor(m['nonce_w']),
      nonceC: _bytesFromCbor(m['nonce_c']),
      aad: _bytesFromCbor(m['aad']),
    );
  }
}

/// Découpe `ciphertext || tag(16)` en (ciphertext, tag) — `cryptography`
/// veut le tag séparément, alors que `noble-ciphers` côté web le concatène.
({Uint8List cipher, Uint8List tag}) _splitTag(Uint8List ct) {
  if (ct.length < 16) {
    throw const FormatException('Ciphertext trop court (tag de 16 oct manquant)');
  }
  return (
    cipher: Uint8List.fromList(ct.sublist(0, ct.length - 16)),
    tag: Uint8List.fromList(ct.sublist(ct.length - 16)),
  );
}

Future<Uint8List> _xchacha20Open({
  required Uint8List key,
  required Uint8List nonce,
  required Uint8List ciphertextWithTag,
  required Uint8List aad,
}) async {
  final algo = Xchacha20.poly1305Aead();
  final split = _splitTag(ciphertextWithTag);
  final plain = await algo.decrypt(
    SecretBox(split.cipher, nonce: nonce, mac: Mac(split.tag)),
    secretKey: SecretKey(key),
    aad: aad,
  );
  return Uint8List.fromList(plain);
}

/// Déchiffre un item à partir de l'enveloppe sérialisée (base64url(CBOR)).
///
/// Algorithme (v1) :
///   1. base64url-decode + CBOR-decode → `PassEnvelopeV1`.
///   2. `VK = HKDF(MK, info="cloudity-pass/v1/vault-key:" + vault_id)`.
///   3. `IK_item = open(wrap, VK, nonce_w, aad_wrap="wrap:"+aad)`.
///   4. `plaintext = open(ct, IK_item, nonce_c, aad)`.
///   5. CBOR-decode du plaintext → `PassItemPlaintext` (schema=1).
///
/// Lance `FormatException` si format/version invalide,
/// `SecretBoxAuthenticationError` si le tag Poly1305 ne valide pas.
Future<PassItemPlaintext> decryptItemFromVault({
  required String envelopeB64u,
  required Uint8List masterKey,
  String? expectedVaultId,
}) async {
  final env = PassEnvelopeV1.decode(envelopeB64u);
  if (expectedVaultId != null && env.vaultId != expectedVaultId) {
    throw FormatException(
      'vault_id mismatch (envelope=${env.vaultId}, expected=$expectedVaultId)',
    );
  }

  final vk = await deriveVaultKey(masterKey: masterKey, vaultId: env.vaultId);
  Uint8List? ikItem;
  try {
    final wrapAad = Uint8List.fromList(utf8.encode('wrap:${utf8.decode(env.aad)}'));
    ikItem = await _xchacha20Open(
      key: vk,
      nonce: env.nonceW,
      ciphertextWithTag: env.wrap,
      aad: wrapAad,
    );
    final plainBytes = await _xchacha20Open(
      key: ikItem,
      nonce: env.nonceC,
      ciphertextWithTag: env.ct,
      aad: env.aad,
    );
    final cborItem = cbor.decode(plainBytes);
    if (cborItem is! CborMap) {
      throw const FormatException('Plaintext: pas un CBOR map');
    }
    final plain = <String, dynamic>{};
    _mapFromCbor(cborItem).forEach((k, v) {
      plain[k] = _unwrapCbor(v);
    });
    final schema = plain['schema'];
    if (schema is! int || schema != 1) {
      throw FormatException('Plaintext: schema non supporté ($schema)');
    }
    return PassItemPlaintext(
      schema: schema,
      type: (plain['type'] as String?) ?? PassItemTypes.note,
      fields: (plain['fields'] as Map?)?.cast<String, dynamic>() ?? const {},
      notes: plain['notes'] as String?,
      tags: ((plain['tags'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(growable: false),
    );
  } finally {
    zeroize(vk);
    if (ikItem != null) zeroize(ikItem);
  }
}

/// Met à zéro un buffer secret en mémoire (best-effort en Dart).
void zeroize(Uint8List buf) {
  for (var i = 0; i < buf.length; i++) {
    buf[i] = 0;
  }
}

/// Préfixe stable du salt utilisateur — **doit** correspondre exactement à
/// `USER_SALT_PREFIX` dans `frontend/.../pass/vaultContext.tsx`. Sinon le MK
/// dérivé sur mobile ne correspondra pas à celui utilisé pour chiffrer les
/// items côté web (ils ont été chiffrés sous `MK_web` ; le mobile doit
/// retrouver la **même** clé).
const String _userSaltPrefix = 'cloudity-pass:v1:user-salt:';

/// Salt utilisateur déterministe (16 oct) — aligné sur `deriveUserSalt`
/// côté web (`vaultContext.tsx`). Permet d'avoir un salt stable côté serveur
/// sans le stocker en clair en base : on dérive
/// `SHA-256("cloudity-pass:v1:user-salt:" + user_id)` puis on tronque à 16 oct.
///
/// **Non secret** par construction (le préfixe est dans le code, et `user_id`
/// est connu). C'est l'**Argon2id** qui apporte le coût ; le salt sert juste
/// à éviter la réutilisation de tables précalculées entre utilisateurs.
Future<Uint8List> deriveUserSaltDeterministic(String userId) async {
  final h = Sha256();
  final hash = await h.hash(utf8.encode('$_userSaltPrefix$userId'));
  return Uint8List.fromList(hash.bytes.sublist(0, 16));
}
