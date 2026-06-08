/// Messages réseau lisibles pour les écrans de connexion mobile.
library;

/// Transforme une exception HTTP/réseau brute en message utilisateur (français).
String friendlyNetworkMessage(
  Object error, {
  String action = 'joindre Cloudity',
}) {
  final raw = error.toString().toLowerCase();

  if (raw.contains('network is unreachable') ||
      raw.contains('errno = 101') ||
      raw.contains('failed host lookup') ||
      raw.contains('no address associated with hostname') ||
      raw.contains('name or service not known')) {
    return 'Pas de réseau ou gateway injoignable.\n'
        '• Vérifie le Wi‑Fi / données mobiles sur le téléphone.\n'
        '• En USB : `adb reverse tcp:6080 tcp:6080` puis gateway `http://127.0.0.1:6080`.\n'
        '• Sinon : `make up` sur le PC + même réseau que le téléphone.';
  }

  if (raw.contains('connection refused') || raw.contains('errno = 111')) {
    return 'Cloudity ne répond pas sur cette adresse.\n'
        'Lance `make up` sur le PC et vérifie l’URL gateway (réglages avancés).';
  }

  if (raw.contains('connection timed out') ||
      raw.contains('timeout') ||
      raw.contains('timed out')) {
    return 'Délai dépassé en essayant de $action.\n'
        'Vérifie le réseau et que le gateway est démarré.';
  }

  if (raw.contains('handshake') || raw.contains('certificate')) {
    return 'Connexion TLS impossible vers le gateway.\n'
        'Vérifie l’URL (http vs https) et le certificat local.';
  }

  if (error is FormatException) {
    return 'Réponse serveur illisible. Réessaie dans un instant.';
  }

  // Auth métier déjà formaté côté AuthApi.
  if (error.toString().startsWith('Connexion impossible') ||
      error.toString().startsWith('Gateway Cloudity')) {
    return error.toString();
  }

  return 'Impossible de $action pour l’instant.\n'
      'Détail technique : ${error.runtimeType}';
}
