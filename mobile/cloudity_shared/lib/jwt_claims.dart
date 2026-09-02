import 'dart:convert';

/// Décode le payload JWT (sans vérifier la signature).
Map<String, dynamic>? decodeJwtPayload(String token) {
  try {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    var b64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    switch (b64.length % 4) {
      case 2:
        b64 += '==';
      case 3:
        b64 += '=';
      case 1:
        return null;
    }
    final jsonStr = utf8.decode(base64.decode(b64));
    final decoded = jsonDecode(jsonStr);
    if (decoded is! Map<String, dynamic>) return null;
    return decoded;
  } catch (_) {
    return null;
  }
}

/// Extrait `tenant_id` du JWT d'accès (login sans saisie tenant).
int? tenantIdFromAccessToken(String token) {
  final payload = decodeJwtPayload(token);
  if (payload == null) return null;
  final tid = payload['tenant_id'];
  if (tid is int) return tid;
  if (tid is String) return int.tryParse(tid);
  if (tid is num) return tid.toInt();
  return null;
}

/// Extrait `role` du JWT d'accès (`admin` / `user`).
String? roleFromAccessToken(String token) {
  final payload = decodeJwtPayload(token);
  if (payload == null) return null;
  final role = payload['role']?.toString().trim().toLowerCase();
  if (role == null || role.isEmpty) return null;
  return role;
}

/// Instant d’expiration du JWT d’accès (claim `exp`), ou null si illisible.
DateTime? accessTokenExpiresAt(String token) {
  final payload = decodeJwtPayload(token);
  if (payload == null) return null;
  final exp = payload['exp'];
  int? seconds;
  if (exp is int) {
    seconds = exp;
  } else if (exp is num) {
    seconds = exp.toInt();
  } else if (exp is String) {
    seconds = int.tryParse(exp);
  }
  if (seconds == null) return null;
  return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
}

/// Vrai si le token est déjà expiré ou expire dans [within].
bool isAccessTokenExpiringSoon(
  String token, {
  Duration within = const Duration(minutes: 10),
}) {
  final exp = accessTokenExpiresAt(token);
  if (exp == null) return true;
  return !exp.isAfter(DateTime.now().toUtc().add(within));
}
