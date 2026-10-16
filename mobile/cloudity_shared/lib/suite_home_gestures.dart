import 'dart:convert';

/// Retour système sur le shell d’accueil Hubera.
/// [stay] : déjà sur l’accueil, la route racine ne pop pas (l’app ne se ferme pas).
enum SuiteRootBack { closeSettings, handledByPage, stay }

SuiteRootBack decideSuiteRootBack({
  required bool showSettings,
  bool pageHandlesBack = false,
}) {
  if (showSettings) return SuiteRootBack.closeSettings;
  if (pageHandlesBack) return SuiteRootBack.handledByPage;
  return SuiteRootBack.stay;
}

/// `null` = liste confirmée vide : effacer le cache d’accueil.
/// Sinon le prochain lancement réaffiche des entrées déjà supprimées.
String? suiteHomeCachePayload(List<Map<String, dynamic>> items) {
  if (items.isEmpty) return null;
  return jsonEncode(items);
}
