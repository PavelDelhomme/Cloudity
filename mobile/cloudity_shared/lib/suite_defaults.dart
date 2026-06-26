/// Ports et URLs par défaut de la suite Cloudity (alignés PORT-ORG-01 / `.env.example`).
abstract final class ClouditySuiteDefaults {
  static const int gatewayPort = 6002;

  static const defaultGatewayUsb = 'http://127.0.0.1:6002';
  static const defaultGatewayEmulator = 'http://10.0.2.2:6002';

  /// Compte admin local après `make seed-admin` (surcharge `SEED_ADMIN_EMAIL` dans `.env`).
  static const devAdminEmail = 'admin@cloudity.local';

  /// Email réel recommandé en dev perso (IMAP / admin) — voir `.env.example`.
  static const personalAdminEmail = 'paul@delhomme.ovh';
}
