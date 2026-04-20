/// Clés de stockage **communes à toute la suite Cloudity** (Photos, Drive, Mail, …).
/// Toutes les apps Flutter doivent réutiliser ces identifiants pour qu’une session
/// puisse être partagée sur un même appareil (même coffre sécurisé / préférences).
///
/// Voir [docs/MOBILES.md](../../docs/MOBILES.md) § « Auth suite ».
abstract final class CloudityStorageKeys {
  /// URL du gateway (ex. `http://10.0.2.2:6080`) — [SharedPreferences], non secret.
  static const gatewayUrl = 'cloudity_suite_gateway_url_v1';

  /// Jetons — [FlutterSecureStorage].
  static const accessToken = 'cloudity_suite_access_token_v1';
  static const refreshToken = 'cloudity_suite_refresh_token_v1';

  /// Émulateur Android → machine hôte.
  static const defaultGateway = 'http://10.0.2.2:6080';
}
