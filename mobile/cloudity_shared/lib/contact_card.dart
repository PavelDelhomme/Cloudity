import 'contact_maps.dart';

/// Champs utiles d’une fiche, partagés par l’affichage et l’édition.
class LabeledValue {
  const LabeledValue({this.label = '', this.value = ''});

  final String label;
  final String value;
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

    final addr = firstContactAddress(item);
    return ContactCardData(
      name: name,
      organization: profile['organization']?.toString().trim() ?? '',
      jobTitle: profile['job_title']?.toString().trim() ?? '',
      department: profile['department']?.toString().trim() ?? '',
      phones: phones,
      emails: emails,
      street: addr?['street']?.toString().trim() ?? '',
      postalCode: addr?['postal_code']?.toString().trim() ?? '',
      city: addr?['city']?.toString().trim() ?? '',
      addressLabel: addr?['label']?.toString().trim() ?? '',
      birthday: profile['birthday']?.toString().trim() ?? '',
      notes: profile['notes']?.toString().trim() ?? '',
      addressLine: formatContactAddress(addr),
      photoUrl: contactPhotoUrl(item),
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

const kPhoneLabelIds = ['mobile', 'home', 'work', 'other'];
const kEmailLabelIds = ['personal', 'work', 'other'];

String contactLabelFr(String raw) {
  switch (raw.trim().toLowerCase()) {
    case 'mobile':
      return 'Mobile';
    case 'home':
    case 'domicile':
      return 'Domicile';
    case 'work':
    case 'travail':
      return 'Travail';
    case 'personal':
    case 'personnel':
      return 'Personnel';
    case 'other':
    case 'autre':
      return 'Autre';
    case 'main':
    case 'primary':
      return 'Principal';
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
