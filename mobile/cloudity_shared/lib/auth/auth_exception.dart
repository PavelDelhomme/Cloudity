/// Erreur HTTP / métier auth gateway (login, refresh, validate…).
class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
