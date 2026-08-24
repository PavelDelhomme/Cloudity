import 'package:cloudity_shared/cloudity_shared.dart';

import '../api/pass_api.dart';

/// Session API authentifiée — jetons JWT + extras Pass (userId pour salt vault).
///
/// **Ne contient PAS** la master key : la MK vit uniquement dans
/// `VaultController` (state Flutter), zéroisée au lock.
class PassUserSession extends CloudityUserSession<PassApi> {
  PassUserSession({
    required super.api,
    required super.accessToken,
    required super.refreshToken,
    required this.userId,
    this.userEmail,
  });

  final String userId;
  final String? userEmail;

  @override
  Future<void> persist() async {
    final email = userEmail?.trim() ?? '';
    if (email.isEmpty) {
      await SessionStore.saveSession(
        gatewayUrl: api.baseUrl,
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
      return;
    }
    await SessionStore.saveSessionWithEmail(
      gatewayUrl: api.baseUrl,
      accessToken: accessToken,
      refreshToken: refreshToken,
      email: email,
      userId: userId,
    );
  }
}
