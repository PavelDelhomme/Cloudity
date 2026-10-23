import 'dart:convert';

import 'package:http/http.dart' as http;

/// Une proposition d’adresse, structurée comme le carnet (rue, code, ville, pays).
class ContactAddressHit {
  const ContactAddressHit({
    required this.label,
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
}

/// Même recherche que Hubera Maps : Photon, puis Nominatim. Pas de clé Google.
Future<List<ContactAddressHit>> searchHuberaAddresses(String query) async {
  final q = query.trim();
  if (q.length < 3) return const [];
  final client = http.Client();
  try {
    final photon = await _get(
      client,
      Uri.parse(
        'https://photon.komoot.io/api/?q=${Uri.encodeQueryComponent(q)}&lang=fr&limit=8',
      ),
      headers: const {'User-Agent': 'HuberaContacts', 'Accept': 'application/json'},
    );
    final fromPhoton = hitsFromPhoton(photon);
    if (fromPhoton.isNotEmpty) return fromPhoton;
    final nominatim = await _get(
      client,
      Uri.parse(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=fr&q=${Uri.encodeQueryComponent(q)}',
      ),
      headers: const {'User-Agent': 'HuberaContacts', 'Accept': 'application/json'},
    );
    return hitsFromNominatim(nominatim);
  } catch (_) {
    return const [];
  } finally {
    client.close();
  }
}

Future<Object?> _get(http.Client client, Uri uri, {Map<String, String>? headers}) async {
  final res = await client.get(uri, headers: headers).timeout(const Duration(seconds: 8));
  if (res.statusCode < 200 || res.statusCode >= 300) return null;
  return jsonDecode(res.body);
}

List<ContactAddressHit> hitsFromPhoton(Object? json) {
  if (json is! Map) return const [];
  final features = json['features'];
  if (features is! List) return const [];
  final seen = <String>{};
  final out = <ContactAddressHit>[];
  for (final feature in features) {
    if (feature is! Map) continue;
    final props = feature['properties'];
    if (props is! Map) continue;
    final name = _s(props['name']);
    final streetName = _s(props['street']);
    final number = _s(props['housenumber']);
    final city = _s(props['city']).isNotEmpty ? _s(props['city']) : _s(props['state']);
    final country = _s(props['country']);
    final postal = _s(props['postcode']);
    final street = [number, streetName].where((s) => s.isNotEmpty).join(' ');
    final text = _uniqueJoin([
      if (name.isNotEmpty) name,
      if (street.isNotEmpty && street != name) street,
      if (city.isNotEmpty && city != name) city,
      if (country.isNotEmpty) country,
    ]);
    if (text.isEmpty || !seen.add(text)) continue;
    out.add(ContactAddressHit(
      label: text,
      street: street,
      postalCode: postal,
      city: city.isNotEmpty ? city : (street.isEmpty ? name : ''),
      country: country,
    ));
  }
  return out;
}

List<ContactAddressHit> hitsFromNominatim(Object? json) {
  if (json is! List) return const [];
  final seen = <String>{};
  final out = <ContactAddressHit>[];
  for (final entry in json) {
    if (entry is! Map) continue;
    final address = entry['address'] is Map ? entry['address'] as Map : const {};
    final number = _s(address['house_number']);
    final road = _s(address['road']).isNotEmpty ? _s(address['road']) : _s(address['pedestrian']);
    final street = [number, road].where((s) => s.isNotEmpty).join(' ');
    final city = _firstNonEmpty([
      address['city'],
      address['town'],
      address['village'],
      address['municipality'],
      address['hamlet'],
    ]);
    final country = _s(address['country']);
    final postal = _s(address['postcode']);
    final label = _s(entry['display_name']);
    final text = label.isNotEmpty
        ? label
        : _uniqueJoin([street, city, country]);
    if (text.isEmpty || !seen.add(text)) continue;
    out.add(ContactAddressHit(
      label: text,
      street: street.isNotEmpty ? street : _s(address['city']),
      postalCode: postal,
      city: city,
      country: country,
    ));
  }
  return out;
}

String _s(Object? raw) => raw?.toString().trim() ?? '';

String _firstNonEmpty(List<Object?> values) {
  for (final value in values) {
    final v = _s(value);
    if (v.isNotEmpty) return v;
  }
  return '';
}

String _uniqueJoin(List<String> parts) {
  final seen = <String>{};
  final out = <String>[];
  for (final part in parts) {
    final v = part.trim();
    if (v.isEmpty || !seen.add(v)) continue;
    out.add(v);
  }
  return out.join(', ');
}
