import 'contact_maps.dart';

/// Champs utiles d’une fiche, partagés par l’affichage et l’édition.
class LabeledValue {
  const LabeledValue({this.label = '', this.value = ''});

  final String label;
  final String value;
}

/// Bloc nom du formulaire Google Contacts : préfixe, prénom, deuxième prénom, nom, suffixe.
class ContactNameParts {
  const ContactNameParts({
    this.prefix = '',
    this.given = '',
    this.middle = '',
    this.family = '',
    this.suffix = '',
  });

  final String prefix;
  final String given;
  final String middle;
  final String family;
  final String suffix;

  String get display => [prefix, given, middle, family, suffix]
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join(' ');

  bool get isEmpty => display.isEmpty;
}

/// Nom affiché. Les champs vides ne laissent pas de double espace.
String composeContactDisplayName(ContactNameParts parts) => parts.display;

/// Relit le nom enregistré. S’il n’y a que le nom affiché, le premier mot
/// devient le prénom et le reste le nom : rien n’est jeté.
ContactNameParts readContactName(Map<String, dynamic> item) {
  final profile = item['profile'] is Map
      ? Map<String, dynamic>.from(item['profile'] as Map)
      : <String, dynamic>{};
  String pick(List<Object?> keys) {
    for (final key in keys) {
      final raw = key is String
          ? (profile[key] ?? item[key])
          : null;
      final v = raw?.toString().trim() ?? '';
      if (v.isNotEmpty) return v;
    }
    return '';
  }

  final prefix = pick(['name_prefix', 'prefix']);
  final given = pick(['given_name', 'first_name']);
  final middle = pick(['middle_name']);
  final family = pick(['family_name', 'last_name']);
  final suffix = pick(['name_suffix', 'suffix']);
  if ([prefix, given, middle, family, suffix].any((s) => s.isNotEmpty)) {
    return ContactNameParts(
      prefix: prefix,
      given: given,
      middle: middle,
      family: family,
      suffix: suffix,
    );
  }
  final display = (item['display_name'] ?? item['name'] ?? '').toString().trim();
  final words = display.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
  if (words.isEmpty) return const ContactNameParts();
  if (words.length == 1) return ContactNameParts(given: words.first);
  return ContactNameParts(given: words.first, family: words.sublist(1).join(' '));
}

class ContactAddress {
  const ContactAddress({
    this.label = '',
    this.street = '',
    this.postalCode = '',
    this.city = '',
    this.country = '',
  });

  final String label;
  final String street;
  final String postalCode;
  final String city;
  final String country;

  bool get isEmpty =>
      street.trim().isEmpty &&
      postalCode.trim().isEmpty &&
      city.trim().isEmpty &&
      country.trim().isEmpty;

  String get line => formatContactAddress({
        'street': street,
        'postal_code': postalCode,
        'city': city,
        'country': country,
      });

  factory ContactAddress.fromMap(Map raw) {
    return ContactAddress(
      label: raw['label']?.toString().trim() ?? '',
      street: raw['street']?.toString().trim() ?? '',
      postalCode: raw['postal_code']?.toString().trim() ?? '',
      city: raw['city']?.toString().trim() ?? '',
      country: raw['country']?.toString().trim() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'label': label,
        if (street.isNotEmpty) 'street': street,
        if (postalCode.isNotEmpty) 'postal_code': postalCode,
        if (city.isNotEmpty) 'city': city,
        if (country.isNotEmpty) 'country': country,
      };
}

class ContactCustomField {
  const ContactCustomField({this.label = '', this.value = ''});

  final String label;
  final String value;

  bool get isEmpty => label.trim().isEmpty && value.trim().isEmpty;
}

List<ContactAddress> contactAddressesOf(Map<String, dynamic> item) {
  final profile = item['profile'];
  if (profile is! Map) return const [];
  final raw = profile['addresses'];
  if (raw is! List) return const [];
  return [
    for (final entry in raw)
      if (entry is Map) ContactAddress.fromMap(entry),
  ];
}

class ContactCardData {
  const ContactCardData({
    required this.name,
    required this.organization,
    required this.jobTitle,
    required this.department,
    required this.phones,
    required this.emails,
    required this.street,
    required this.postalCode,
    required this.city,
    required this.addressLabel,
    required this.birthday,
    required this.notes,
    required this.addressLine,
    this.photoUrl,
    this.country = '',
    this.addresses = const [],
    this.nameParts = const ContactNameParts(),
    this.phonetic = '',
    this.nickname = '',
    this.fileAs = '',
    this.relation = '',
    this.website = '',
    this.labels = '',
    this.customFields = const [],
  });

  final String name;
  final String organization;
  final String jobTitle;
  final String department;
  final List<LabeledValue> phones;
  final List<LabeledValue> emails;
  final String street;
  final String postalCode;
  final String city;
  final String addressLabel;
  final String birthday;
  final String notes;
  final String addressLine;
  final String? photoUrl;
  final String country;
  final List<ContactAddress> addresses;
  final ContactNameParts nameParts;
  final String phonetic;
  final String nickname;
  final String fileAs;
  final String relation;
  final String website;
  final String labels;
  final List<ContactCustomField> customFields;

  String get orgLine {
    final bits = [jobTitle, organization, department].where((s) => s.isNotEmpty);
    return bits.join(' · ');
  }

  factory ContactCardData.fromItem(Map<String, dynamic> item) {
    final profile = item['profile'] is Map
        ? Map<String, dynamic>.from(item['profile'] as Map)
        : <String, dynamic>{};
    var name = (item['display_name'] ?? item['name'] ?? '').toString().trim();
    if (name.isEmpty) {
      final given = (profile['given_name'] ?? item['first_name'] ?? '').toString().trim();
      final family = (profile['family_name'] ?? item['last_name'] ?? '').toString().trim();
      name = '$given $family'.trim();
    }
    final columnEmail = (item['email'] ?? '').toString().trim();
    final columnPhone = (item['phone'] ?? '').toString().trim();
    if (name.isEmpty) {
      name = columnEmail.isNotEmpty && columnEmail != 'locked@vault.local'
          ? columnEmail
          : columnPhone;
    }

    var phones = labeledValues(profile['phones']);
    if (columnPhone.isNotEmpty &&
        !phones.any((p) => p.value.replaceAll(RegExp(r'\s'), '') ==
            columnPhone.replaceAll(RegExp(r'\s'), ''))) {
      phones = [LabeledValue(label: 'mobile', value: columnPhone), ...phones];
    }

    var emails = labeledValues(profile['emails']);
    if (columnEmail.isNotEmpty &&
        columnEmail != 'locked@vault.local' &&
        !emails.any((e) => e.value.toLowerCase() == columnEmail.toLowerCase())) {
      emails = [LabeledValue(label: 'personal', value: columnEmail), ...emails];
    }
    emails = [
      for (final e in emails)
        if (e.value != 'locked@vault.local' && e.value.contains('@')) e,
    ];

    final addresses = contactAddressesOf(item);
    final addr = addresses.isEmpty ? null : addresses.first;
    final customs = <ContactCustomField>[];
    final rawCustoms = profile['custom_fields'];
    if (rawCustoms is List) {
      for (final entry in rawCustoms) {
        if (entry is! Map) continue;
        customs.add(ContactCustomField(
          label: entry['label']?.toString().trim() ?? '',
          value: entry['value']?.toString().trim() ?? '',
        ));
      }
    }
    return ContactCardData(
      name: name,
      organization: profile['organization']?.toString().trim() ?? '',
      jobTitle: profile['job_title']?.toString().trim() ?? '',
      department: profile['department']?.toString().trim() ?? '',
      phones: phones,
      emails: emails,
      street: addr?.street ?? '',
      postalCode: addr?.postalCode ?? '',
      city: addr?.city ?? '',
      addressLabel: addr?.label ?? '',
      birthday: profile['birthday']?.toString().trim() ?? '',
      notes: profile['notes']?.toString().trim() ?? '',
      addressLine: addr?.line ?? '',
      photoUrl: contactPhotoUrl(item),
      country: addr?.country ?? '',
      addresses: addresses,
      nameParts: readContactName(item),
      phonetic: profile['phonetic_name']?.toString().trim() ?? '',
      nickname: profile['nickname']?.toString().trim() ?? '',
      fileAs: profile['file_as']?.toString().trim() ?? '',
      relation: profile['relation']?.toString().trim() ?? '',
      website: profile['website']?.toString().trim() ?? '',
      labels: profile['labels']?.toString().trim() ?? '',
      customFields: customs,
    );
  }
}

List<LabeledValue> labeledValues(Object? raw) {
  if (raw is! List) return const [];
  final out = <LabeledValue>[];
  for (final item in raw) {
    if (item is String) {
      final v = item.trim();
      if (v.isNotEmpty) out.add(LabeledValue(value: v));
    } else if (item is Map) {
      final v = (item['value'] ?? item['number'] ?? '').toString().trim();
      if (v.isEmpty) continue;
      out.add(LabeledValue(
        label: item['label']?.toString().trim() ?? '',
        value: v,
      ));
    }
  }
  return out;
}

String? contactPhotoUrl(Map<String, dynamic> item) {
  String? pick(Object? raw) {
    final v = raw?.toString().trim() ?? '';
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    return null;
  }

  for (final key in ['photo', 'photo_url', 'avatar', 'avatar_url']) {
    final v = pick(item[key]);
    if (v != null) return v;
  }
  final profile = item['profile'];
  if (profile is Map) {
    for (final key in ['photo', 'photo_url', 'avatar', 'avatar_url']) {
      final v = pick(profile[key]);
      if (v != null) return v;
    }
  }
  return null;
}

int? contactItemId(Map<String, dynamic> item) {
  final id = item['id'];
  if (id is int) return id;
  return int.tryParse(id?.toString() ?? '');
}

String contactInitials(String name) {
  final parts = name.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  String one(String s) => s.substring(0, 1).toUpperCase();
  if (parts.length == 1) return one(parts.first);
  return '${one(parts.first)}${one(parts.last)}';
}

/// Libellés vus dans Google Contacts sur le téléphone : menu du numéro.
const kPhoneLabelIds = ['mobile', 'work', 'home', 'main', 'fax_work', 'fax_home', 'pager'];

/// Libellés vus pour l’e-mail et l’adresse : Domicile, Bureau, Autre, Personnalisé.
const kEmailLabelIds = ['home', 'work', 'other', 'custom'];
const kAddressLabelIds = ['home', 'work', 'other', 'custom'];

String contactLabelFr(String raw) {
  switch (raw.trim().toLowerCase()) {
    case 'mobile':
      return 'Mobile';
    case 'home':
    case 'domicile':
      return 'Domicile';
    case 'work':
    case 'travail':
    case 'bureau':
    case 'pro':
      return 'Bureau';
    case 'personal':
    case 'personnel':
    case 'perso':
      return 'Personnel';
    case 'other':
    case 'autre':
      return 'Autre';
    case 'custom':
    case 'personnalise':
    case 'personnalisé':
      return 'Personnalisé';
    case 'main':
    case 'primary':
    case 'principal':
      return 'Principal';
    case 'fax_work':
    case 'fax travail':
      return 'Fax travail';
    case 'fax_home':
    case 'fax domicile':
      return 'Fax domicile';
    case 'pager':
    case 'bipeur':
      return 'Bipeur';
    default:
      final t = raw.trim();
      if (t.isEmpty) return '';
      return t.length == 1 ? t.toUpperCase() : '${t[0].toUpperCase()}${t.substring(1)}';
  }
}

const _months = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/// Affiche un anniversaire AAAA-MM-JJ en jour mois année.
String formatContactBirthday(String raw) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw.trim());
  if (m == null) return raw.trim();
  final month = int.tryParse(m.group(2)!);
  final day = int.tryParse(m.group(3)!);
  if (month == null || day == null || month < 1 || month > 12) return raw.trim();
  return '$day ${_months[month - 1]} ${m.group(1)}';
}
