/// Adresse contact → deep link Hubera Maps (`hubera-maps://?q=`).
String formatContactAddress(Map<String, dynamic>? addr) {
  if (addr == null) return '';
  final street = addr['street']?.toString().trim() ?? '';
  final postal = addr['postal_code']?.toString().trim() ?? '';
  final city = addr['city']?.toString().trim() ?? '';
  final region = addr['region']?.toString().trim() ?? '';
  final country = addr['country']?.toString().trim() ?? '';
  final cityLine = [postal, city].where((s) => s.isNotEmpty).join(' ');
  return [street, cityLine, region, country].where((s) => s.isNotEmpty).join(', ');
}

Map<String, dynamic>? firstContactAddress(Map<String, dynamic> item) {
  final profile = item['profile'];
  if (profile is Map) {
    final addrs = profile['addresses'];
    if (addrs is List && addrs.isNotEmpty && addrs.first is Map) {
      return Map<String, dynamic>.from(addrs.first as Map);
    }
  }
  return null;
}

String contactAddressQuery(Map<String, dynamic> item) {
  return formatContactAddress(firstContactAddress(item));
}

/// Deep link natif Maps (schéma canonical). Vide si pas d’adresse.
String huberaMapsDeepLink(String address) {
  final q = address.trim();
  if (q.isEmpty) return '';
  return 'hubera-maps://?q=${Uri.encodeQueryComponent(q)}';
}

/// Fallback web / PWA si l’app Maps n’est pas installée.
String huberaMapsWebLink(String address) {
  final q = address.trim();
  if (q.isEmpty) return '';
  return 'https://maps.hubera.cloud/?q=${Uri.encodeQueryComponent(q)}';
}
