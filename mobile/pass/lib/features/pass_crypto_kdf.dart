part of 'pass_crypto.dart';

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
