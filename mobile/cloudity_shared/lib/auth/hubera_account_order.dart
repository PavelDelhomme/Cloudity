const huberaDeviceAccountPinKey = 'hubera_device_account_email';

/// Admin : la passkey automatique ne doit pas devancer un choix de compte.
bool adminShouldAutoPasskey({
  required bool chooserRequested,
  required int listedAccounts,
}) {
  if (chooserRequested) return false;
  return listedAccounts <= 0;
}

/// Le jeton appliqué doit être celui du compte tapé.
bool sessionMatchesChosenAccount({
  required String chosenEmail,
  required String tokenEmail,
}) {
  final chosen = chosenEmail.trim().toLowerCase();
  final token = tokenEmail.trim().toLowerCase();
  if (chosen.isEmpty || token.isEmpty) return false;
  return chosen == token;
}

/// Une passkey partie avant le tap ne remplace pas le compte choisi.
bool passkeyMayApply({
  required int passkeyGeneration,
  required int pickGeneration,
}) {
  return passkeyGeneration == pickGeneration;
}

bool huberaSourceIsDeviceCarrier(String? source) {
  final p = (source ?? '').trim().toLowerCase();
  if (p.isEmpty) return false;
  return p == 'cloud.hubera.id' ||
      p == 'ovh.delhomme.ytmusic' ||
      p.startsWith('cloud.hubera.music');
}

/// Garde l’épingle si ce compte est encore là.
/// Sinon épingle le plus ancien porté par Music / Hubera ID, sinon le plus ancien.
String? rememberHuberaDeviceAccount({
  required String? existingPin,
  required List<String> emails,
  required List<String?> sources,
  required List<int> updatedAt,
}) {
  final present = <String>{};
  for (final raw in emails) {
    final email = raw.trim().toLowerCase();
    if (email.isNotEmpty) present.add(email);
  }
  final pin = existingPin?.trim().toLowerCase() ?? '';
  if (pin.isNotEmpty && present.contains(pin)) return pin;

  int? bestCarrier;
  int? bestAny;
  bool older(int index, int? prev) {
    if (prev == null) return true;
    final u = index < updatedAt.length ? updatedAt[index] : 0;
    final pu = prev < updatedAt.length ? updatedAt[prev] : 0;
    if (u <= 0 && pu <= 0) return index < prev;
    if (u <= 0) return false;
    if (pu <= 0) return true;
    return u < pu;
  }

  for (var i = 0; i < emails.length; i++) {
    if (emails[i].trim().isEmpty) continue;
    if (older(i, bestAny)) bestAny = i;
    final src = i < sources.length ? sources[i] : null;
    if (huberaSourceIsDeviceCarrier(src) && older(i, bestCarrier)) {
      bestCarrier = i;
    }
  }
  final pick = bestCarrier ?? bestAny;
  if (pick == null) return pin.isEmpty ? null : pin;
  return emails[pick].trim().toLowerCase();
}

/// Une entrée par e-mail. La copie la plus récente qui a un jeton gagne.
List<T> mergeAccountsWithTokens<T>(
  List<T> primary,
  List<T> extra, {
  required String Function(T account) emailOf,
  required bool Function(T account) hasToken,
  required int Function(T account) updatedAtOf,
}) {
  final best = <String, T>{};
  void consider(T account) {
    if (!hasToken(account)) return;
    final email = emailOf(account).trim().toLowerCase();
    if (email.isEmpty) return;
    final prev = best[email];
    if (prev == null || updatedAtOf(account) >= updatedAtOf(prev)) {
      best[email] = account;
    }
  }

  for (final account in primary) {
    consider(account);
  }
  for (final account in extra) {
    consider(account);
  }
  return best.values.toList();
}

List<T> placeHuberaAccountFirst<T>(
  List<T> accounts,
  String? pin,
  String Function(T account) emailOf,
) {
  final key = pin?.trim().toLowerCase() ?? '';
  if (key.isEmpty || accounts.length < 2) return List<T>.from(accounts);
  final first = <T>[];
  final rest = <T>[];
  for (final account in accounts) {
    if (emailOf(account).trim().toLowerCase() == key) {
      first.add(account);
    } else {
      rest.add(account);
    }
  }
  if (first.isEmpty) return List<T>.from(accounts);
  return [...first, ...rest];
}
