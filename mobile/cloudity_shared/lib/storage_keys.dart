import 'suite_defaults.dart';

/// Clés de stockage **communes à toute la suite Cloudity** (Photos, Drive, Mail, Admin, …).
abstract final class CloudityStorageKeys {
  static const gatewayUrl = 'cloudity_suite_gateway_url_v1';
  static const accessToken = 'cloudity_suite_access_token_v1';
  static const refreshToken = 'cloudity_suite_refresh_token_v1';
  static const accountEmail = 'cloudity_suite_account_email_v1';
  static const tenantId = 'cloudity_suite_tenant_id_v1';
  /// Pass — identifiant utilisateur (dérivation salt vault).
  static const userId = 'cloudity_pass_user_id_v1';
  static const userEmail = 'cloudity_pass_user_email_v1';
  static const secureMkWrapped = 'cloudity_pass_secure_mk_wrapped_v1';
  static const biometricEnabled = 'cloudity_pass_biometric_enabled_v1';
  static const defaultGateway = ClouditySuiteDefaults.defaultGatewayUsb;
}
