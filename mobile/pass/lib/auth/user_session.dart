import '../api/pass_api.dart';

/// Session API authentifiée — détient les tokens JWT et l'instance HTTP.
///
/// **Ne contient PAS** la master key : la MK vit uniquement dans
/// `VaultController` (state Flutter), zéroisée au lock.
class PassUserSession {
  PassUserSession({
    required this.api,
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    this.userEmail,
  });

  final PassApi api;
  String accessToken;
  String refreshToken;
  final String userId;
  final String? userEmail;
}
