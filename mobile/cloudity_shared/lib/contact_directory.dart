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
