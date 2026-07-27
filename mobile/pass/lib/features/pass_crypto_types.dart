part of 'pass_crypto.dart';

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
