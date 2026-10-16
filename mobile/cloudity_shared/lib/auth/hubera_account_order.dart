const huberaDeviceAccountPinKey = 'hubera_device_account_email';

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
