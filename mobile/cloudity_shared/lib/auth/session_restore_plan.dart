/// Plan du cold start session, sans I/O.
class SessionRestorePlan {
  const SessionRestorePlan({
    required this.returnLocalAccess,
    required this.networkAttempts,
    required this.clearTokensOnTransportError,
  });

  /// Jeton d'accès déjà en local : le premier écran n'attend pas le réseau.
  final bool returnLocalAccess;

  /// Sans access token : un seul essai, pas toute la liste de gateways.
  final int networkAttempts;

  /// Une coupure ne doit pas effacer le refresh encore valide.
  final bool clearTokensOnTransportError;
}

SessionRestorePlan planSessionRestore({
  required bool hasAccessToken,
  required int gatewayCandidates,
}) {
  if (hasAccessToken) {
    return const SessionRestorePlan(
      returnLocalAccess: true,
      networkAttempts: 0,
      clearTokensOnTransportError: false,
    );
  }
  return SessionRestorePlan(
    returnLocalAccess: false,
    networkAttempts: gatewayCandidates > 0 ? 1 : 0,
    clearTokensOnTransportError: false,
  );
}
