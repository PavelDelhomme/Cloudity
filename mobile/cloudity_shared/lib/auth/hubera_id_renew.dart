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

final Set<String> _spentRefreshes = {};

/// Ce refresh a déjà été refusé ou tourné : ne plus le poster.
bool refreshTokenSpent(String token) {
  final value = token.trim();
  return value.isNotEmpty && _spentRefreshes.contains(value);
}

void markRefreshSpent(String token) {
  final value = token.trim();
  if (value.isNotEmpty) _spentRefreshes.add(value);
}

void resetSpentRefreshesForTests() => _spentRefreshes.clear();

/// L’app ne renvoie pas son vieux refresh si Hubera ID a déjà la session.
IdRenewChoice planIdRenew({
  required bool accessStillValid,
  required String localRefresh,
  required String expectedEmail,
  required IdSessionView? id,
  required bool idAccessUsable,
  required String idAccessEmail,
  bool accessRejected = false,
  String spentRefresh = '',
  String localAccess = '',
}) {
  final spent = spentRefresh.trim();
  bool blocked(String value) {
    final v = value.trim();
    return spent.isNotEmpty && v.isNotEmpty && v == spent;
  }

  if (accessStillValid && !accessRejected) return IdRenewChoice.keepLocal;

  if (id != null && !id.dead && idAccessUsable && id.access.trim().isNotEmpty) {
    final sameRejected = accessRejected &&
        localAccess.trim().isNotEmpty &&
        id.access.trim() == localAccess.trim();
    if (!sameRejected) {
      final want = expectedEmail.trim().toLowerCase();
      final got = idAccessEmail.trim().toLowerCase();
      if (want.isNotEmpty && got.isNotEmpty && want != got) {
        return IdRenewChoice.chooser;
      }
      return IdRenewChoice.useId;
    }
  }

  if (id == null) {
    if (localRefresh.trim().isEmpty || blocked(localRefresh)) {
      return IdRenewChoice.chooser;
    }
    return IdRenewChoice.askServer;
  }
  if (id.dead) return IdRenewChoice.chooser;
  final idRefresh = id.refresh.trim();
  if (idRefresh.isNotEmpty && !blocked(idRefresh)) return IdRenewChoice.hold;
  if (localRefresh.trim().isNotEmpty && !blocked(localRefresh) && idRefresh.isEmpty) {
    return IdRenewChoice.askServer;
  }
  return IdRenewChoice.chooser;
}
