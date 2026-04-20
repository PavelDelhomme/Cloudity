/// Clés de stockage **communes à toute la suite Cloudity** (Photos, Drive, Mail, …).
/// Réutiliser les mêmes identifiants que `mobile/photos` pour partager la session.
///
/// Voir [docs/MOBILES.md](../../docs/MOBILES.md).
abstract final class CloudityStorageKeys {
  static const gatewayUrl = 'cloudity_suite_gateway_url_v1';
  static const accessToken = 'cloudity_suite_access_token_v1';
  static const refreshToken = 'cloudity_suite_refresh_token_v1';
  static const defaultGateway = 'http://10.0.2.2:6080';
}
