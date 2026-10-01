/// Résolution des noms Hubera Contacts pour l’expéditeur / les destinataires.

class MailPerson {
  const MailPerson({required this.name, required this.email});
  final String name;
  final String email;

  String get primary => name.trim().isNotEmpty ? name.trim() : email;
  String? get secondary {
    if (name.trim().isEmpty) return null;
    if (email.isEmpty) return null;
    if (name.trim().toLowerCase() == email.toLowerCase()) return null;
    return email;
  }

  String get initial {
    final s = primary.trim();
    if (s.isEmpty) return '?';
    return s[0].toUpperCase();
  }
}

String extractEmailFromSender(String raw) {
  final trimmed = raw.trim();
  final angle = trimmed.lastIndexOf('<');
  if (angle >= 0 && trimmed.endsWith('>')) {
    return trimmed.substring(angle + 1, trimmed.length - 1).trim();
  }
  final m = RegExp(r'[^\s<>,;]+@[^\s<>,;]+').firstMatch(trimmed);
  return (m?.group(0) ?? '').trim();
}

String extractDisplayNameFromSender(String raw) {
  final trimmed = raw.trim();
  final angle = trimmed.lastIndexOf('<');
  if (angle > 0 && trimmed.endsWith('>')) {
    var name = trimmed.substring(0, angle).trim().replaceAll(RegExp(r',$'), '');
    if ((name.startsWith('"') && name.endsWith('"')) ||
        (name.startsWith("'") && name.endsWith("'"))) {
      name = name.substring(1, name.length - 1);
    }
    return name.trim();
  }
  return '';
}

List<String> _emailsOfContact(Map<String, dynamic> c) {
  final out = <String>[];
  void add(String? raw) {
    final e = raw?.trim().toLowerCase() ?? '';
    if (e.contains('@') && !out.contains(e)) out.add(e);
  }

  add(c['email']?.toString());
  final profile = c['profile'];
  if (profile is Map) {
    final emails = profile['emails'];
    if (emails is List) {
      for (final item in emails) {
        if (item is Map) add(item['value']?.toString());
        if (item is String) add(item);
      }
    }
  }
  return out;
}

String _contactDisplayName(Map<String, dynamic> c) {
  for (final key in ['display_name', 'name']) {
    final v = c[key]?.toString().trim() ?? '';
    if (v.isNotEmpty) return v;
  }
  final fn = c['first_name']?.toString().trim() ?? '';
  final ln = c['last_name']?.toString().trim() ?? '';
  final full = '$fn $ln'.trim();
  if (full.isNotEmpty) return full;
  final profile = c['profile'];
  if (profile is Map) {
    final given = profile['given_name']?.toString().trim() ?? '';
    final family = profile['family_name']?.toString().trim() ?? '';
    final nick = profile['nickname']?.toString().trim() ?? '';
    final composed = '$given $family'.trim();
    if (composed.isNotEmpty) return composed;
    if (nick.isNotEmpty) return nick;
  }
  return c['email']?.toString().trim() ?? '';
}

class MailContactBook {
  MailContactBook(this.contacts);

  final List<Map<String, dynamic>> contacts;

  final Map<String, String> _byEmail = {};

  void _ensureIndex() {
    if (_byEmail.isNotEmpty || contacts.isEmpty) return;
    for (final c in contacts) {
      final name = _contactDisplayName(c);
      if (name.isEmpty) continue;
      for (final e in _emailsOfContact(c)) {
        _byEmail[e] = name;
      }
    }
  }

  MailPerson resolve(String fromHeader) {
    _ensureIndex();
    final headerName = extractDisplayNameFromSender(fromHeader);
    final email = extractEmailFromSender(fromHeader);
    if (headerName.isNotEmpty && email.isNotEmpty) {
      return MailPerson(name: headerName, email: email);
    }
    if (email.isNotEmpty) {
      final book = _byEmail[email.toLowerCase()];
      if (book != null && book.isNotEmpty) {
        return MailPerson(name: book, email: email);
      }
      return MailPerson(name: email, email: email);
    }
    final fallback = fromHeader.trim();
    return MailPerson(name: fallback.isEmpty ? '(inconnu)' : fallback, email: '');
  }

  List<({String name, String email})> suggestions(String query) {
    final q = query.trim().toLowerCase();
    final out = <({String name, String email})>[];
    final seen = <String>{};
    for (final c in contacts) {
      final name = _contactDisplayName(c);
      for (final email in _emailsOfContact(c)) {
        if (seen.contains(email)) continue;
        if (q.isNotEmpty &&
            !name.toLowerCase().contains(q) &&
            !email.contains(q)) {
          continue;
        }
        seen.add(email);
        out.add((name: name.isEmpty ? email : name, email: email));
      }
    }
    out.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return out.take(12).toList();
  }
}

ColorSeed colorForEmail(String email) {
  final s = email.trim().toLowerCase();
  var h = 0;
  for (final cu in s.codeUnits) {
    h = (h * 31 + cu) & 0x7fffffff;
  }
  const palette = <int>[
    0xFF1A73E8,
    0xFFD93025,
    0xFF188038,
    0xFFE37400,
    0xFFA142F4,
    0xFF007B83,
    0xFFC5221F,
    0xFF1967D2,
  ];
  return ColorSeed(palette[h % palette.length]);
}

class ColorSeed {
  const ColorSeed(this.value);
  final int value;
}
