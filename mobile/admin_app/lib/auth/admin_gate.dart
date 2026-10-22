import 'package:flutter/foundation.dart';

/// Message affiché sur l’écran de connexion. Le serveur a refusé le rôle admin.
const adminDeniedMessage = 'Compte non administrateur.';

/// Notice lue par l’écran de connexion. Vide : pas de refus en cours.
final ValueNotifier<String?> adminLoginNotice = ValueNotifier<String?>(null);

/// L’accueil ne s’ouvre que si le jeton porte déjà le rôle admin.
/// Un jeton encore valide mais sans ce rôle reste dehors : le serveur tranche.
bool adminOpensHome({required String? role, required bool accessStillValid}) {
  return role == 'admin' && accessStillValid;
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
