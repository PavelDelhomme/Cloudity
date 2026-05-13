/// Clés de stockage local — préfixées `cloudity_pass_*` pour cohabiter avec
/// les autres apps Cloudity (drive, mail, photos) qui utilisent leur propre
/// préfixe. Le partage de session entre apps n'est PAS souhaitable pour
/// Pass : le coffre est verrouillé à chaque relance par défaut.
class CloudityPassStorageKeys {
  CloudityPassStorageKeys._();

  static const gatewayUrl = 'cloudity_pass_gateway_url';
  static const accessToken = 'cloudity_pass_access_token';
  static const refreshToken = 'cloudity_pass_refresh_token';
  static const userId = 'cloudity_pass_user_id';
  static const userEmail = 'cloudity_pass_user_email';

  /// Indicateur "biométrie activée pour ce compte" — la MK n'est PAS stockée
  /// en clair ; ce flag déclenche juste l'invitation biométrique au prochain
  /// unlock (et la clé wrappée vit dans `secure_mk_wrapped`).
  static const biometricEnabled = 'cloudity_pass_biometric_enabled';

  /// Master key wrappée par flutter_secure_storage (Keystore Android /
  /// Keychain iOS). N'est lue qu'après authentification biométrique.
  static const secureMkWrapped = 'cloudity_pass_mk_wrapped';

  static const defaultGateway = 'http://10.0.2.2:6080';
}
