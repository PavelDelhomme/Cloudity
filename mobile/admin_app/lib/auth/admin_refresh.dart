import 'package:cloudity_shared/cloudity_shared.dart';

/// Session reprise, ou choix de compte si le refresh est vraiment mort.
class AdminRefreshResult {
  const AdminRefreshResult.session(this.access, this.refresh) : openChooser = false;

  const AdminRefreshResult.chooser()
      : access = '',
        refresh = '',
        openChooser = true;

  final String access;
  final String refresh;
  final bool openChooser;
}

/// Un jeton encore valide mais sans rôle admin doit être renouvelé.
/// Le compte labo reste refusé : le nouveau jeton relit le rôle en base.
bool adminNeedsRoleRefresh({required bool? isAdmin, required String refresh}) {
  if (isAdmin != false) return false;
  return refresh.trim().isNotEmpty;
}

/// JWT encore valide, déjà `admin`, du même e-mail. Jamais la copie d’un autre compte.
({String access, String refresh})? adminSessionAlreadyValid({
  required String expectedEmail,
  required List<({String email, String access, String refresh})> copies,
}) {
  final want = expectedEmail.trim().toLowerCase();
  if (want.isEmpty) return null;
  ({String access, String refresh})? best;
  var bestHasRefresh = false;
  for (final copy in copies) {
    if (copy.email.trim().toLowerCase() != want) continue;
    final access = copy.access.trim();
    if (roleFromAccessToken(access) != 'admin') continue;
    if (isAccessTokenExpiringSoon(access)) continue;
    final refresh = copy.refresh.trim();
    final hasRefresh = refresh.isNotEmpty;
    if (best != null && bestHasRefresh) continue;
    if (best != null && !hasRefresh) continue;
    best = (access: access, refresh: refresh);
    bestHasRefresh = hasRefresh;
  }
  return best;
}

/// Le jeton courant peut encore dire `user` alors que la base a promu le compte.
/// On essaie chaque refresh de CE compte jusqu’à un rôle admin. Un échec de
/// refresh ne conclut pas : une autre copie peut encore être valable.
Future<({String access, String refresh, bool? isAdmin})> resolveAdminTokens({
  required String access,
  required String refresh,
  required String expectedEmail,
  required List<({String email, String access, String refresh})> copies,
  required Future<bool?> Function(String access) roleOf,
  required Future<({String access, String refresh})> Function(String refresh) refreshTokens,
  Future<({String access, String refresh})> Function(String access)? renewAccess,
}) async {
  final want = expectedEmail.trim().toLowerCase();
  final ready = adminSessionAlreadyValid(expectedEmail: want, copies: copies);
  var nextAccess = ready?.access ?? access;
  var nextRefresh = refresh;
  if (ready != null && ready.refresh.trim().isNotEmpty) {
    nextRefresh = ready.refresh;
  }
  var isAdmin = await roleOf(nextAccess);
  if (isAdmin != false) {
    return (access: nextAccess, refresh: nextRefresh, isAdmin: isAdmin);
  }
  final refreshes = adminSameAccountRefreshes(
    currentRefresh: nextRefresh,
    expectedEmail: want,
    copies: [
      for (final copy in copies) (email: copy.email, refresh: copy.refresh),
    ],
  );
  for (final token in refreshes) {
    try {
      final pair = await refreshTokens(token);
      final email = (emailFromAccessToken(pair.access) ?? '').trim().toLowerCase();
      if (want.isNotEmpty &&
          email.isNotEmpty &&
          !sessionMatchesChosenAccount(chosenEmail: want, tokenEmail: email)) {
        continue;
      }
      nextAccess = pair.access;
      nextRefresh = pair.refresh;
      isAdmin = await roleOf(nextAccess);
      if (isAdmin != false) break;
    } on AuthException {
      continue;
    }
  }
  if (isAdmin == false && renewAccess != null && nextAccess.trim().isNotEmpty) {
    try {
      final pair = await renewAccess(nextAccess);
      final email = (emailFromAccessToken(pair.access) ?? '').trim().toLowerCase();
      if (want.isEmpty ||
          email.isEmpty ||
          sessionMatchesChosenAccount(chosenEmail: want, tokenEmail: email)) {
        nextAccess = pair.access;
        if (pair.refresh.trim().isNotEmpty) nextRefresh = pair.refresh;
        isAdmin = await roleOf(nextAccess);
      }
    } on AuthException {
      // Le verdict du jeton courant reste valable.
    }
  }
  return (access: nextAccess, refresh: nextRefresh, isAdmin: isAdmin);
}

/// Vrai seulement pour le 401 « invalid or expired refresh token ».
/// Une coupure réseau ne doit pas ouvrir le choix de compte.
bool adminRefreshTokenRejected(Object error) {
  final message = error.toString().toLowerCase();
  if (!message.contains('refresh')) return false;
  return message.contains('401') || message.contains('invalid or expired');
}

bool adminAccessStillValid(String access) {
  final exp = accessTokenExpiresAt(access);
  if (exp == null) return false;
  return exp.isAfter(DateTime.now().toUtc());
}

/// Refresh du compte déjà choisi, puis les autres copies du même e-mail.
/// Jamais le jeton d’un autre compte.
List<String> adminSameAccountRefreshes({
  required String currentRefresh,
  required String? expectedEmail,
  required List<({String email, String refresh})> copies,
}) {
  final out = <String>[];
  void add(String token) {
    final value = token.trim();
    if (value.isEmpty || out.contains(value)) return;
    out.add(value);
  }

  add(currentRefresh);
  final want = expectedEmail?.trim().toLowerCase() ?? '';
  if (want.isEmpty) return out;
  for (final copy in copies) {
    if (copy.email.trim().toLowerCase() != want) continue;
    add(copy.refresh);
  }
  return out;
}

/// Un access encore loin de l’expiration est gardé.
/// Un refresh valide (celui-ci ou une copie du même compte) remplace la session.
/// Un refresh rejeté ouvre le choix de compte, sans retenter en boucle.
Future<AdminRefreshResult> recoverAdminRefresh({
  required String access,
  required String refresh,
  required String? expectedEmail,
  required Future<List<({String email, String refresh})>> Function() listCopies,
  required Future<({String access, String refresh})> Function(
    String access,
    String refresh,
  ) refreshTokens,
}) async {
  if (access.isNotEmpty && !isAccessTokenExpiringSoon(access)) {
    return AdminRefreshResult.session(access, refresh);
  }

  final copies = await listCopies();
  final candidates = adminSameAccountRefreshes(
    currentRefresh: refresh,
    expectedEmail: expectedEmail,
    copies: copies,
  );
  if (candidates.isEmpty) return const AdminRefreshResult.chooser();

  Object? transportError;
  var rejected = false;
  final want = expectedEmail?.trim().toLowerCase() ?? '';
  for (final token in candidates) {
    try {
      final pair = await refreshTokens(access, token);
      final email = emailFromAccessToken(pair.access);
      if (want.isNotEmpty &&
          email != null &&
          !sessionMatchesChosenAccount(chosenEmail: want, tokenEmail: email)) {
        continue;
      }
      return AdminRefreshResult.session(pair.access, pair.refresh);
    } catch (error) {
      if (adminRefreshTokenRejected(error)) {
        rejected = true;
        continue;
      }
      transportError = error;
      break;
    }
  }

  if (transportError != null && access.isNotEmpty) {
    return AdminRefreshResult.session(access, refresh);
  }
  if (transportError != null) throw transportError;
  if (rejected) return const AdminRefreshResult.chooser();
  return const AdminRefreshResult.chooser();
}
