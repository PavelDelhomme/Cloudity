/// Annuaire Hubera Contacts : Personnel (Google du téléphone) et Professionnel (Hubera).
enum ContactDirectory { personal, professional }

/// Source des fiches lues sur le fournisseur Contacts Android, compte Google.
const String kDeviceGoogleSource = 'device_google';

const String _googleAccountType = 'com.google';

bool isDeviceGoogleContact(Map<String, dynamic> item) =>
    item['source']?.toString() == kDeviceGoogleSource;

/// Compte Google déjà présent sur le téléphone. Vide = le lecteur Android a déjà filtré.
bool isGoogleDeviceAccount(String? accountType) {
  final t = (accountType ?? '').trim().toLowerCase();
  if (t.isEmpty) return true;
  return t == _googleAccountType;
}

/// Fiche personnelle issue du carnet. N’emporte aucun secret, n’ajoute rien au sync Hubera.
Map<String, dynamic>? normalizeDeviceGoogleContact(Map<dynamic, dynamic> raw) {
  final account = (raw['account_type'] ?? raw['accountType'])?.toString();
  if (!isGoogleDeviceAccount(account)) return null;
  final name = (raw['display_name'] ?? raw['name'] ?? '').toString().trim();
  final email = (raw['email'] ?? '').toString().trim();
  final phone = (raw['phone'] ?? '').toString().trim();
  if (name.isEmpty && email.isEmpty && phone.isEmpty) return null;
  final lookup = (raw['lookup'] ?? '').toString().trim();
  return {
    'display_name': name.isEmpty ? (email.isNotEmpty ? email : phone) : name,
    'email': email,
    'phone': phone,
    'source': kDeviceGoogleSource,
    'hubera_directory': 'personal',
    'account_type': _googleAccountType,
    if (lookup.isNotEmpty) 'lookup': lookup,
  };
}

List<Map<String, dynamic>> personalContactsFromDevice(Iterable<Map> raw) {
  final out = <Map<String, dynamic>>[];
  final seen = <String>{};
  for (final row in raw) {
    final contact = normalizeDeviceGoogleContact(row);
    if (contact == null) continue;
    final key = '${contact['lookup']}|${contact['display_name']}|${contact['email']}|${contact['phone']}';
    if (!seen.add(key)) continue;
    out.add(contact);
  }
  return out;
}

/// Professionnel = contacts Hubera déjà là. Personnel = uniquement le carnet Google.
List<Map<String, dynamic>> contactsForDirectory({
  required List<Map<String, dynamic>> hubera,
  required List<Map<String, dynamic>> device,
  required ContactDirectory directory,
}) {
  if (directory == ContactDirectory.professional) {
    return [
      for (final item in hubera)
        if (!isDeviceGoogleContact(item)) item,
    ];
  }
  return personalContactsFromDevice(device);
}

class ContactDirectorySplit {
  const ContactDirectorySplit({
    required this.professional,
    required this.personal,
  });

  final List<Map<String, dynamic>> professional;
  final List<Map<String, dynamic>> personal;
}

/// L’import ne retire pas les contacts Hubera et ne les mélange pas au carnet Google.
ContactDirectorySplit splitDeviceGoogleImport({
  required List<Map<String, dynamic>> hubera,
  required Iterable<Map> deviceRaw,
}) {
  final personal = personalContactsFromDevice(deviceRaw);
  final professional = [
    for (final item in hubera)
      if (!isDeviceGoogleContact(item)) Map<String, dynamic>.from(item),
  ];
  return ContactDirectorySplit(professional: professional, personal: personal);
}

/// Liste principale, archive ou corbeille. Le défaut [active] ne change pas l’annuaire.
enum ContactShelf { active, archive, trash, blocked }

/// Décision de création : déjà autorisé → on crée ; sinon une seule demande.
enum ContactCreatePermission { proceed, askOnce, stop }

ContactCreatePermission contactCreatePermission({
  required bool alreadyGranted,
  bool? asked,
}) {
  if (alreadyGranted) return ContactCreatePermission.proceed;
  if (asked == null) return ContactCreatePermission.askOnce;
  if (asked) return ContactCreatePermission.proceed;
  return ContactCreatePermission.stop;
}

/// Offset à réappliquer au retour d’une fiche, borné à la liste encore là.
double contactScrollRestore(double saved, double maxExtent) {
  if (saved.isNaN || maxExtent.isNaN || maxExtent < 0 || saved <= 0) return 0;
  if (saved > maxExtent) return maxExtent;
  return saved;
}

/// Le retour d’une fiche reste sur l’étagère d’où on l’a ouverte.
ContactShelf contactShelfAfterDetail(ContactShelf openedFrom) => openedFrom;

class ContactPlacement {
  const ContactPlacement({
    this.directory = const {},
    this.trashAt = const {},
    this.archived = const {},
    this.favorites = const {},
  });

  /// Clé stable → `personal` ou `professional`. Absent = annuaire d’origine.
  final Map<String, String> directory;
  final Map<String, String> trashAt;
  final Set<String> archived;

  /// Clés marquées favori. Ne retire aucune fiche.
  final Set<String> favorites;

  ContactPlacement assignDirectory({
    required Iterable<String> keys,
    required String directory,
  }) {
    final next = Map<String, String>.from(this.directory);
    for (final key in keys) {
      if (directory == 'personal' || directory == 'professional') {
        next[key] = directory;
      }
    }
    return ContactPlacement(
      directory: next,
      trashAt: trashAt,
      archived: archived,
      favorites: favorites,
    );
  }

  ContactPlacement toggleFavorite(String key) {
    final next = Set<String>.from(favorites);
    if (!next.remove(key)) next.add(key);
    return ContactPlacement(
      directory: directory,
      trashAt: trashAt,
      archived: archived,
      favorites: next,
    );
  }

  ContactPlacement moveToTrash({
    required Iterable<String> keys,
    required String at,
  }) {
    final trash = Map<String, String>.from(trashAt);
    final archive = Set<String>.from(archived);
    for (final key in keys) {
      trash[key] = at;
      archive.remove(key);
    }
    return ContactPlacement(
      directory: directory,
      trashAt: trash,
      archived: archive,
      favorites: favorites,
    );
  }

  ContactPlacement moveToArchive({required Iterable<String> keys}) {
    final trash = Map<String, String>.from(trashAt);
    final archive = Set<String>.from(archived);
    for (final key in keys) {
      trash.remove(key);
      archive.add(key);
    }
    return ContactPlacement(
      directory: directory,
      trashAt: trash,
      archived: archive,
      favorites: favorites,
    );
  }

  ContactPlacement restore({required Iterable<String> keys}) {
    final trash = Map<String, String>.from(trashAt);
    final archive = Set<String>.from(archived);
    for (final key in keys) {
      trash.remove(key);
      archive.remove(key);
    }
    return ContactPlacement(
      directory: directory,
      trashAt: trash,
      archived: archive,
      favorites: favorites,
    );
  }

  ContactPlacement forget({required Iterable<String> keys}) {
    final dir = Map<String, String>.from(directory);
    final trash = Map<String, String>.from(trashAt);
    final archive = Set<String>.from(archived);
    final favs = Set<String>.from(favorites);
    for (final key in keys) {
      dir.remove(key);
      trash.remove(key);
      archive.remove(key);
      favs.remove(key);
    }
    return ContactPlacement(directory: dir, trashAt: trash, archived: archive, favorites: favs);
  }

  Map<String, dynamic> toJson() => {
        'directory': directory,
        'trash': trashAt,
        'archive': archived.toList(),
        'favorites': favorites.toList(),
      };

  bool get isEmpty =>
      directory.isEmpty && trashAt.isEmpty && archived.isEmpty && favorites.isEmpty;

  static ContactPlacement fromJson(Object? raw) {
    if (raw is! Map) return const ContactPlacement();
    final dir = <String, String>{};
    final directoryRaw = raw['directory'];
    if (directoryRaw is Map) {
      for (final entry in directoryRaw.entries) {
        final value = entry.value?.toString();
        if (value == 'personal' || value == 'professional') {
          dir[entry.key.toString()] = value!;
        }
      }
    }
    final trash = <String, String>{};
    final trashRaw = raw['trash'];
    if (trashRaw is Map) {
      for (final entry in trashRaw.entries) {
        trash[entry.key.toString()] = entry.value?.toString() ?? '';
      }
    }
    final archive = <String>{};
    final archiveRaw = raw['archive'];
    if (archiveRaw is List) {
      for (final key in archiveRaw) {
        final value = key?.toString() ?? '';
        if (value.isNotEmpty) archive.add(value);
      }
    }
    final favs = <String>{};
    final favRaw = raw['favorites'];
    if (favRaw is List) {
      for (final key in favRaw) {
        final value = key?.toString() ?? '';
        if (value.isNotEmpty) favs.add(value);
      }
    }
    return ContactPlacement(directory: dir, trashAt: trash, archived: archive, favorites: favs);
  }
}

/// Favoris de la liste déjà affichée. Les autres fiches restent.
List<Map<String, dynamic>> contactFavorites(
  List<Map<String, dynamic>> visible,
  Set<String> favorites,
) {
  if (favorites.isEmpty) return const [];
  return [
    for (final item in visible)
      if (favorites.contains(contactStableKey(item))) item,
  ];
}

String contactDigits(String raw) {
  final buffer = StringBuffer();
  for (final code in raw.codeUnits) {
    if (code >= 48 && code <= 57) buffer.writeCharCode(code);
  }
  final digits = buffer.toString();
  if (digits.length > 9) return digits.substring(digits.length - 9);
  return digits;
}

/// Même fiche = même clé. Un déplacement ne fabrique pas une autre clé.
String contactStableKey(Map<String, dynamic> item) {
  if (!isDeviceGoogleContact(item)) {
    final id = item['id'];
    if (id != null && '$id'.trim().isNotEmpty && '$id' != 'null') {
      return 'h:$id';
    }
  }
  final lookup = (item['lookup'] ?? '').toString().trim();
  if (lookup.isNotEmpty) return 'd:$lookup';
  final email = (item['email'] ?? '').toString().trim().toLowerCase();
  final phone = contactDigits((item['phone'] ?? '').toString());
  final name = (item['display_name'] ?? item['name'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  return 'd:$email|$phone|$name';
}

String contactDedupeKey(Map<String, dynamic> item) {
  final email = (item['email'] ?? '').toString().trim().toLowerCase();
  if (email.contains('@') &&
      email != 'locked@vault.local' &&
      !email.endsWith('@imported.hubera.local')) {
    return 'e:$email';
  }
  final phone = contactDigits((item['phone'] ?? '').toString());
  if (phone.length >= 8) return 'p:$phone';
  final name = (item['display_name'] ?? item['name'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  if (name.isNotEmpty) return 'n:$name';
  return 'k:${contactStableKey(item)}';
}

String? _profileExtra(Map<String, dynamic> item, String key) {
  final profile = item['profile'];
  if (profile is! Map) return null;
  final extra = profile['extra'];
  if (extra is! Map) return null;
  final value = extra[key]?.toString().trim() ?? '';
  if (value.isEmpty) return null;
  return value;
}

/// Première ouverture : reprend l’étiquette déjà posée sur la fiche Hubera.
ContactPlacement placementFromProfiles(Iterable<Map<String, dynamic>> items) {
  final directory = <String, String>{};
  final trash = <String, String>{};
  final archive = <String>{};
  for (final item in items) {
    if (isDeviceGoogleContact(item)) continue;
    final key = contactStableKey(item);
    final dir = _profileExtra(item, 'directory');
    if (dir == 'personal' || dir == 'professional') directory[key] = dir!;
    final shelf = _profileExtra(item, 'shelf');
    if (shelf == 'trash') {
      trash[key] = _profileExtra(item, 'trashed_at') ?? '';
    } else if (shelf == 'archive') {
      archive.add(key);
    }
  }
  return ContactPlacement(directory: directory, trashAt: trash, archived: archive, favorites: const {});
}

String contactEffectiveDirectory(
  Map<String, dynamic> item,
  Map<String, String> overrides,
) {
  final override = overrides[contactStableKey(item)];
  if (override == 'personal' || override == 'professional') return override!;
  final extra = _profileExtra(item, 'directory');
  if (extra == 'personal' || extra == 'professional') return extra!;
  if (isDeviceGoogleContact(item) || item['hubera_directory'] == 'personal') {
    return 'personal';
  }
  return 'professional';
}

/// Une seule fiche par personne dans la liste affichée. On garde la fiche Hubera.
List<Map<String, dynamic>> dedupeContactCards(List<Map<String, dynamic>> cards) {
  final byKey = <String, Map<String, dynamic>>{};
  final order = <String>[];
  for (final card in cards) {
    final key = contactDedupeKey(card);
    final previous = byKey[key];
    if (previous == null) {
      byKey[key] = card;
      order.add(key);
      continue;
    }
    if (isDeviceGoogleContact(previous) && !isDeviceGoogleContact(card)) {
      byKey[key] = card;
    }
  }
  return [for (final key in order) byKey[key]!];
}

/// Étagère affichée. [placement] vide + [active] = le même découpage qu’aujourd’hui.
List<Map<String, dynamic>> contactsOnShelf({
  required List<Map<String, dynamic>> hubera,
  required List<Map<String, dynamic>> device,
  ContactPlacement placement = const ContactPlacement(),
  ContactShelf shelf = ContactShelf.active,
  ContactDirectory? directory,
}) {
  final cards = <Map<String, dynamic>>[
    for (final item in hubera)
      if (!isDeviceGoogleContact(item)) Map<String, dynamic>.from(item),
    ...device,
  ];
  final visible = <Map<String, dynamic>>[];
  for (final item in cards) {
    final key = contactStableKey(item);
    final trashed = placement.trashAt.containsKey(key);
    final archived = placement.archived.contains(key);
    final shown = switch (shelf) {
      ContactShelf.trash => trashed,
      ContactShelf.archive => archived && !trashed,
      ContactShelf.blocked => false,
      ContactShelf.active => !trashed && !archived,
    };
    if (!shown) continue;
    if (shelf == ContactShelf.active && directory != null) {
      final want = directory == ContactDirectory.personal ? 'personal' : 'professional';
      if (contactEffectiveDirectory(item, placement.directory) != want) continue;
    }
    visible.add(item);
  }
  final unique = dedupeContactCards(visible);
  unique.sort((a, b) {
    final an = (a['display_name'] ?? a['name'] ?? '').toString().toLowerCase();
    final bn = (b['display_name'] ?? b['name'] ?? '').toString().toLowerCase();
    return an.compareTo(bn);
  });
  return unique;
}

class BlockedNumbersView {
  const BlockedNumbersView({
    required this.canRead,
    required this.canWrite,
    required this.reason,
    required this.numbers,
  });

  final bool canRead;
  final bool canWrite;
  final String reason;
  final List<String> numbers;
}

/// Ce que le téléphone a vraiment renvoyé. Pas de liste inventée.
BlockedNumbersView blockedNumbersFromChannel(Map<dynamic, dynamic>? raw) {
  if (raw == null) {
    return const BlockedNumbersView(
      canRead: false,
      canWrite: false,
      reason: 'Le téléphone n’a pas répondu.',
      numbers: [],
    );
  }
  final canRead = raw['canRead'] == true;
  final canWrite = raw['canWrite'] == true && canRead;
  final reason = (raw['reason'] ?? '').toString().trim();
  if (!canRead) {
    return BlockedNumbersView(
      canRead: false,
      canWrite: false,
      reason: reason.isEmpty
          ? 'Le téléphone ne donne pas la liste des numéros bloqués.'
          : reason,
      numbers: const [],
    );
  }
  final numbers = <String>[];
  final list = raw['numbers'];
  if (list is List) {
    for (final row in list) {
      if (row is Map) {
        final number = (row['number'] ?? row['original'] ?? '').toString().trim();
        if (number.isNotEmpty) numbers.add(number);
      } else if (row is String && row.trim().isNotEmpty) {
        numbers.add(row.trim());
      }
    }
  }
  return BlockedNumbersView(
    canRead: true,
    canWrite: canWrite,
    reason: reason,
    numbers: numbers,
  );
}

class BlockAttempt {
  const BlockAttempt({required this.blocked, required this.reason});

  final bool blocked;
  final String reason;
}

/// Bloqué seulement si une relecture du téléphone contient encore le numéro.
BlockAttempt interpretBlockResult({
  required Map<dynamic, dynamic>? raw,
  required String number,
  required List<String> reread,
}) {
  final reason = (raw?['reason'] ?? '').toString().trim();
  if (raw == null || raw['ok'] != true) {
    return BlockAttempt(
      blocked: false,
      reason: reason.isEmpty ? 'Le téléphone a refusé de bloquer ce numéro.' : reason,
    );
  }
  final wanted = contactDigits(number);
  final seen = reread.any((entry) {
    if (entry.trim() == number.trim()) return true;
    final digits = contactDigits(entry);
    return wanted.length >= 8 && digits == wanted;
  });
  if (!seen) {
    return const BlockAttempt(
      blocked: false,
      reason: 'Le téléphone n’a pas enregistré le blocage.',
    );
  }
  return const BlockAttempt(blocked: true, reason: '');
}

/// Contacts ouverts au moins une fois, du plus vu au moins vu.
/// Une fiche jamais ouverte n’apparaît pas : on n’invente pas de nom.
List<Map<String, dynamic>> contactSuggestionsByViews(
  List<Map<String, dynamic>> items,
  Map<String, int> views, {
  int limit = 8,
}) {
  final ranked = <Map<String, dynamic>>[
    for (final item in items)
      if ((views[contactStableKey(item)] ?? 0) > 0) item,
  ];
  ranked.sort((a, b) {
    final diff = (views[contactStableKey(b)] ?? 0).compareTo(views[contactStableKey(a)] ?? 0);
    if (diff != 0) return diff;
    return contactStableKey(a).compareTo(contactStableKey(b));
  });
  if (ranked.length <= limit) return ranked;
  return ranked.sublist(0, limit);
}
