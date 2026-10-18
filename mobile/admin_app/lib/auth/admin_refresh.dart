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
