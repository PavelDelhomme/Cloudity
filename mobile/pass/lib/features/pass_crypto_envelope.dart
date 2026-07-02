part of 'pass_crypto.dart';

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
