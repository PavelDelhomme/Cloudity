import 'dart:convert';

/// Retour système sur le shell d’accueil Hubera.
/// [stay] : déjà sur l’accueil, la route racine ne pop pas (l’app ne se ferme pas).
enum SuiteRootBack { closeSettings, handledByPage, stay }

/// Retour Tasks : une liste filtrée ou une recherche revient à « toutes ».
bool tasksFilterBack({int? selectedListId, String query = ''}) {
  return selectedListId != null || query.trim().isNotEmpty;
}

SuiteRootBack decideSuiteRootBack({
  required bool showSettings,
  bool pageHandlesBack = false,
}) {
  if (showSettings) return SuiteRootBack.closeSettings;
  if (pageHandlesBack) return SuiteRootBack.handledByPage;
  return SuiteRootBack.stay;
}

/// Glissement horizontal du planning.
/// Vitesse positive (vers la droite) : jour d’avant. Négative : jour d’après.
int calendarHorizontalDayDelta(double velocity, {double threshold = 280}) {
  if (velocity > threshold) return -1;
  if (velocity < -threshold) return 1;
  return 0;
}

/// `null` = liste confirmée vide : effacer le cache d’accueil.
/// Sinon le prochain lancement réaffiche des entrées déjà supprimées.
String? suiteHomeCachePayload(List<Map<String, dynamic>> items) {
  if (items.isEmpty) return null;
  return jsonEncode(items);
}
