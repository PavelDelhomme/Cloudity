import 'contact_card.dart';

/// Adresse réellement lue sur un mail. Pas une fiche inventée.
class SeenMailAddress {
  const SeenMailAddress({required this.email, this.name = ''});

  final String email;
  final String name;
}

class EmailRecipientSuggestion {
  const EmailRecipientSuggestion({required this.name, required this.email});

  final String name;
  final String email;
}

String normalizeMailEmail(String raw) => raw.trim().toLowerCase();

String mailLocalPart(String email) {
  final e = email.trim();
  final at = e.indexOf('@');
  if (at < 0) return e;
  return e.substring(0, at);
}

/// Services automatiques : le nom ou la partie locale commence par un point.
bool automaticMailIdentity({required String name, required String email}) {
  if (name.trim().startsWith('.')) return true;
  return mailLocalPart(email).startsWith('.');
}

/// "Ada <ada@example.com>" ou une adresse nue. Null s’il n’y a pas d’adresse.
SeenMailAddress? parseSeenMailAddress(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  final angle = trimmed.lastIndexOf('<');
  var name = '';
  var email = '';
  if (angle >= 0 && trimmed.endsWith('>')) {
    email = trimmed.substring(angle + 1, trimmed.length - 1).trim();
    if (angle > 0) {
      name = trimmed.substring(0, angle).trim();
      if ((name.startsWith('"') && name.endsWith('"') && name.length >= 2) ||
          (name.startsWith("'") && name.endsWith("'") && name.length >= 2)) {
        name = name.substring(1, name.length - 1).trim();
      }
    }
  } else {
    final m = RegExp(r'[^\s<>,;]+@[^\s<>,;]+').firstMatch(trimmed);
    email = (m?.group(0) ?? '').trim();
  }
  if (!email.contains('@')) return null;
  return SeenMailAddress(email: normalizeMailEmail(email), name: name);
}

/// En-têtes déjà présents sur des messages. N’ajoute aucune adresse absente de ces messages.
List<SeenMailAddress> seenMailAddressesFromMessages(Iterable<Map> messages) {
  const keys = ['from', 'sender', 'reply_to', 'to', 'cc', 'bcc'];
  final out = <SeenMailAddress>[];
  final seen = <String>{};
  for (final message in messages) {
    for (final key in keys) {
      final raw = message[key]?.toString() ?? '';
      if (raw.trim().isEmpty) continue;
      for (final part in raw.split(RegExp(r'[,;]'))) {
        final parsed = parseSeenMailAddress(part);
        if (parsed == null) continue;
        if (!seen.add(parsed.email)) continue;
        out.add(parsed);
      }
    }
  }
  return out;
}

bool _matchesQuery(String name, String email, String query) {
  if (query.isEmpty) return true;
  return name.toLowerCase().contains(query) || email.contains(query);
}

/// Suggestions d’un champ destinataire.
/// La bibliothèque d’abord, puis les adresses déjà vues qui n’y sont pas.
/// Une adresse dont le nom ou la partie locale commence par un point est ignorée.
/// Rien n’est inventé : seules [library] et [alreadySeen] peuvent sortir.
List<EmailRecipientSuggestion> emailRecipientSuggestions({
  required Iterable<Map> library,
  required Iterable<SeenMailAddress> alreadySeen,
  String query = '',
  int limit = 24,
}) {
  final q = query.trim().toLowerCase();
  final libraryHits = <EmailRecipientSuggestion>[];
  final seenHits = <EmailRecipientSuggestion>[];
  final taken = <String>{};

  void consider(List<EmailRecipientSuggestion> dest, String name, String email) {
    final e = normalizeMailEmail(email);
    if (!e.contains('@') || taken.contains(e)) return;
    if (automaticMailIdentity(name: name, email: e)) return;
    final display = name.trim().isEmpty ? e : name.trim();
    if (!_matchesQuery(display, e, q)) return;
    taken.add(e);
    dest.add(EmailRecipientSuggestion(name: display, email: e));
  }

  for (final raw in library) {
    final item = Map<String, dynamic>.from(raw);
    final card = ContactCardData.fromItem(item);
    if (card.emails.isEmpty) {
      final lone = item['email']?.toString() ?? '';
      consider(libraryHits, card.name, lone);
      continue;
    }
    for (final email in card.emails) {
      consider(libraryHits, card.name, email.value);
    }
  }

  for (final seen in alreadySeen) {
    consider(seenHits, seen.name, seen.email);
  }

  int byName(EmailRecipientSuggestion a, EmailRecipientSuggestion b) =>
      a.name.toLowerCase().compareTo(b.name.toLowerCase());
  libraryHits.sort(byName);
  seenHits.sort(byName);
  return [...libraryHits, ...seenHits].take(limit).toList();
}
