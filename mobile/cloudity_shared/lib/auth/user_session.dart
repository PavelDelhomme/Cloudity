import 'auth_client.dart';
import 'session_store.dart';

/// Session courante (jetons mis à jour après refresh) — H19.
class CloudityUserSession<T extends CloudityAuthClient> {
  CloudityUserSession({
    required this.api,
    required this.accessToken,
    required this.refreshToken,
  });

  final T api;
  String accessToken;
  String refreshToken;

  Future<void> persist() => SessionStore.saveSession(
        gatewayUrl: api.baseUrl,
        accessToken: accessToken,
        refreshToken: refreshToken,
      );

  Future<void> refreshIfNeeded() async {
    final pair = await api.ensureValidTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
    accessToken = pair.access;
    refreshToken = pair.refresh;
    await persist();
  }
}
