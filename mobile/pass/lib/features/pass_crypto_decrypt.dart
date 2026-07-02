part of 'pass_crypto.dart';

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
