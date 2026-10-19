/// Ce que Hubera ID a répondu pour le compte déjà choisi.
class IdSessionView {
  const IdSessionView({
    required this.known,
    this.access = '',
    this.refresh = '',
  });

  final bool known;
  final String access;
  final String refresh;

  bool get dead => known && access.trim().isEmpty && refresh.trim().isEmpty;
}

enum IdRenewChoice { keepLocal, useId, askServer, chooser, hold }

/// L’app ne renvoie pas son vieux refresh si Hubera ID a déjà la session.
IdRenewChoice planIdRenew({
  required bool accessStillValid,
  required String localRefresh,
  required String expectedEmail,
  required IdSessionView? id,
  required bool idAccessUsable,
  required String idAccessEmail,
}) {
  if (accessStillValid) return IdRenewChoice.keepLocal;
  if (id == null) {
    return localRefresh.trim().isEmpty
        ? IdRenewChoice.chooser
        : IdRenewChoice.askServer;
  }
  if (id.dead) return IdRenewChoice.chooser;
  if (idAccessUsable && id.access.trim().isNotEmpty) {
    final want = expectedEmail.trim().toLowerCase();
    final got = idAccessEmail.trim().toLowerCase();
    if (want.isNotEmpty && got.isNotEmpty && want != got) {
      return IdRenewChoice.chooser;
    }
    return IdRenewChoice.useId;
  }
  // Access périmé, refresh encore chez Hubera ID : l’app l’échange, sans mot de passe.
  if (id.refresh.trim().isNotEmpty) return IdRenewChoice.hold;
  return IdRenewChoice.chooser;
}
