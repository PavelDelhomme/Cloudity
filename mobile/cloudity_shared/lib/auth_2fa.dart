/// Flow **2FA** mutualisé pour toutes les apps Cloudity Flutter
/// (Drive, Mail, Photos, Pass, …).
///
/// L'auth-service expose deux endpoints distincts :
///   1. `POST /auth/login`    → si la 2FA est activée, il renvoie
///      `{ "requires_2fa": true, "user_id": <int> }` et **n'émet pas** d'access
///      token. C'est volontaire : le mot de passe seul ne peut pas ouvrir
///      la session.
///   2. `POST /auth/2fa/verify` → `{ email, tenant_id, code }` ; le `code`
///      peut être un TOTP 6 chiffres **ou** un code de récupération (12 chars
///      alphanumériques, avec ou sans tirets) — le serveur détecte le format.
///
/// Ce module fournit deux briques minimales :
///
/// * [LoginRequires2FAException] — exception levée par le client `login()`
///   d'une app pour signaler à l'UI qu'une étape 2 est requise. Elle porte
///   l'`email` et le `tenantId` afin que l'écran 2FA puisse appeler
///   [Auth2FAClient.verify] sans repasser par le mot de passe.
/// * [Auth2FAClient] — POSTe sur `/auth/2fa/verify` avec un `code` saisi par
///   l'utilisateur et retourne les jetons (`access`/`refresh`) ou lève
///   [Auth2FAException] avec un message lisible.
///
/// Aligné sur l'implémentation web (`@cloudity/shared` + `cloudity-web`) :
/// même contrat HTTP, même format de réponse — pour qu'on n'ait qu'**un seul
/// chemin serveur** à durcir, mais que **toutes les surfaces clientes** y
/// accèdent uniformément.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'http_helpers.dart';

/// Levée par le client d'authentification d'une app quand le serveur répond
/// `{ "requires_2fa": true }` à `/auth/login`. L'écran de connexion doit alors
/// présenter un champ « Code 2FA » et invoquer [Auth2FAClient.verify].
class LoginRequires2FAException implements Exception {
  LoginRequires2FAException({
    required this.email,
    required this.tenantId,
    this.userId,
  });

  /// Email saisi par l'utilisateur — réutilisé pour `/auth/2fa/verify`.
  final String email;

  /// Tenant courant (ex. `"1"`).
  final String tenantId;

  /// Identifiant interne renvoyé par `/auth/login` (peut être `null` selon
  /// la réponse serveur ; uniquement utilisé pour télémétrie côté UI).
  final int? userId;

  @override
  String toString() =>
      'LoginRequires2FAException(email=$email, tenantId=$tenantId)';
}

/// Erreur métier remontée par [Auth2FAClient] (HTTP non-200, code refusé,
/// réponse mal formée).
class Auth2FAException implements Exception {
  Auth2FAException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Réponse de succès de `/auth/2fa/verify` après un code valide.
///
/// `recoveryCodes` est non vide **uniquement à la première activation 2FA**
/// (le serveur ne les ré-émet jamais ensuite — il faut explicitement appeler
/// `/auth/2fa/recovery-codes/regenerate`).
class Auth2FAResult {
  Auth2FAResult({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.usedRecoveryCode,
    this.recoveryCodes = const <String>[],
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final bool usedRecoveryCode;
  final List<String> recoveryCodes;
}

/// Client HTTP minimal vers `/auth/2fa/verify`. Volontairement sans dépendance
/// vers `auth_api.dart` des apps : chaque app peut l'utiliser tel quel sans
/// boucle d'imports.
class Auth2FAClient {
  Auth2FAClient(String gatewayBase, {http.Client? client})
    : _base = gatewayBase.trim().replaceAll(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _base;
  final http.Client _client;

  /// Soumet un code (TOTP 6 chiffres ou recovery 12 chars) au serveur. Lève
  /// [Auth2FAException] avec un message localisé pour les codes invalides.
  Future<Auth2FAResult> verify({
    required String email,
    required String tenantId,
    required String code,
  }) async {
    final trimmed = code.trim();
    if (trimmed.isEmpty) {
      throw Auth2FAException('Code 2FA vide.');
    }
    final uri = Uri.parse('$_base/auth/2fa/verify');
    http.Response res;
    try {
      res = await _client
          .post(
            uri,
            headers: authHeaders(null),
            body: jsonEncode({
              'email': email,
              'tenant_id': tenantId,
              'code': trimmed,
            }),
          )
          .timeout(const Duration(seconds: 10));
    } catch (e) {
      throw Auth2FAException('Réseau : $e');
    }
    final raw = res.body.isEmpty ? '{}' : res.body;
    Map<String, dynamic> map;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('réponse 2FA non-objet');
      }
      map = decoded;
    } catch (_) {
      throw Auth2FAException('Réponse serveur invalide.');
    }
    if (res.statusCode == 401) {
      throw Auth2FAException(
        (map['error']?.toString() ?? 'Code invalide.').isEmpty
            ? 'Code invalide.'
            : (map['error']?.toString() ?? 'Code invalide.'),
      );
    }
    if (res.statusCode != 200) {
      final err = map['error']?.toString() ?? raw;
      throw Auth2FAException('2FA HTTP ${res.statusCode}: $err');
    }
    final access = map['access_token'] as String?;
    final refresh = map['refresh_token'] as String?;
    if (access == null || access.isEmpty) {
      throw Auth2FAException('Réponse 2FA sans access_token.');
    }
    final expires = map['expires_in'];
    final used = map['used_recovery_code'];
    final codes = map['recovery_codes'];
    return Auth2FAResult(
      accessToken: access,
      refreshToken: refresh ?? '',
      expiresIn: expires is int ? expires : (expires is num ? expires.toInt() : 0),
      usedRecoveryCode: used == true,
      recoveryCodes: codes is List
          ? codes.whereType<String>().toList(growable: false)
          : const <String>[],
    );
  }

  /// À appeler dans `dispose()` du LoginScreen si on a passé un client
  /// custom — sinon le `http.Client` interne reste partagé.
  void close() => _client.close();
}

/// Heuristique pour distinguer un code de récupération (12 chars
/// alphanumériques, avec ou sans tirets) d'un TOTP (6 chiffres). Reproduit la
/// logique serveur `looksLikeRecoveryCode` (auth-service `recoverycodes.go`)
/// pour aider l'UI à valider la saisie **avant** envoi réseau.
bool looksLikeRecoveryCode(String input) {
  final cleaned = input.replaceAll('-', '').replaceAll(' ', '');
  if (cleaned.length != 12) return false;
  return RegExp(r'^[A-Za-z0-9]{12}$').hasMatch(cleaned);
}
