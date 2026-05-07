/// Helpers HTTP partagés (équivalent Dart de `getAuthHeaders` côté `@cloudity/shared`).
///
/// Centralise la construction des entêtes d'autorisation/JSON pour éviter la duplication
/// de `'Authorization': 'Bearer …'` dans `auth_api.dart` et les écrans.
///
/// NOTE: dupliqué volontairement dans chaque app mobile (mail/drive/photos) car les
/// projets Flutter sont indépendants (pas de package Dart partagé `pubspec` à ce jour).
/// Si on introduit `mobile/cloudity_shared` plus tard, déplacer ce fichier dedans.
library;

/// Construit les en-têtes pour un appel API authentifié.
///
/// - `accessToken` vide/null => pas d'`Authorization` (l'appelant gère).
/// - `json` (défaut true) => ajoute `Content-Type: application/json`.
///   Mettre à `false` pour les GET/DELETE sans body, ou les uploads `multipart/form-data`.
/// - `extra` => entêtes additionnels (ex. `Accept`, `Content-Type` custom).
Map<String, String> authHeaders(
  String? accessToken, {
  bool json = true,
  Map<String, String>? extra,
}) {
  final headers = <String, String>{};
  if (accessToken != null && accessToken.isNotEmpty) {
    headers['Authorization'] = 'Bearer $accessToken';
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  if (extra != null && extra.isNotEmpty) {
    headers.addAll(extra);
  }
  return headers;
}
