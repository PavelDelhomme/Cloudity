import 'package:flutter/foundation.dart';

/// Message affiché sur l’écran de connexion. Le serveur a refusé le rôle admin.
const adminDeniedMessage = 'Compte non administrateur.';

/// Notice lue par l’écran de connexion. Vide : pas de refus en cours.
final ValueNotifier<String?> adminLoginNotice = ValueNotifier<String?>(null);

/// Décision d’ouverture d’après le statut de l’API admin.
/// 200 ouvre le tableau. 403 le laisse fermé. Tout le reste ne l’ouvre pas.
enum AdminEntry { open, denied, unresolved }

AdminEntry adminEntryFromStatus(int? statusCode) {
  if (statusCode == 200) return AdminEntry.open;
  if (statusCode == 403) return AdminEntry.denied;
  return AdminEntry.unresolved;
}

/// 403 de l’API admin : même refus, sans ouvrir le tableau.
bool adminAccessForbidden(Object error) {
  return error.toString().contains('(403)');
}

void adminStayOnLogin([String message = adminDeniedMessage]) {
  adminLoginNotice.value = message;
}

void adminClearLoginNotice() {
  if (adminLoginNotice.value == null) return;
  adminLoginNotice.value = null;
}
