import 'user_preferences_api.dart';

/// Credentials minimales pour synchroniser les préférences compte.
typedef ClouditySessionCredentials = ({
  String gatewayBase,
  String accessToken,
});

/// Télécharge `GET /auth/me/preferences` et met à jour le cache local.
Future<UserPreferencesV1> syncCloudityUserPreferences(
  ClouditySessionCredentials creds,
) async {
  final api = UserPreferencesApi(
    gatewayBase: creds.gatewayBase,
    accessToken: creds.accessToken,
  );
  return api.syncToCache();
}

/// Best-effort : ne lève pas si le réseau est indisponible.
Future<void> syncCloudityUserPreferencesQuiet(
  ClouditySessionCredentials creds,
) async {
  try {
    await syncCloudityUserPreferences(creds);
  } catch (_) {
    /* cache local conservé */
  }
}
