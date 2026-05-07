/// Helpers HTTP partagés (équivalent Dart de `getAuthHeaders` dans `@cloudity/shared`).
///
/// Centralise la construction des entêtes d'autorisation/JSON pour éviter la duplication
/// de `'Authorization': 'Bearer …'` dans les clients HTTP des apps mobiles.
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
