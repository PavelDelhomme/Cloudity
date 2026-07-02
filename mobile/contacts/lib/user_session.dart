import 'auth_api.dart';
import 'session_store.dart';

class UserSession {
  UserSession({
    required this.api,
    required this.accessToken,
    required this.refreshToken,
  });

  final AuthApi api;
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
