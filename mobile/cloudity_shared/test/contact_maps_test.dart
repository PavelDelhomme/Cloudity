import 'package:flutter_test/flutter_test.dart';
import 'package:cloudity_shared/contact_maps.dart';

void main() {
  test('formatContactAddress assemble rue, CP, ville', () {
    expect(
      formatContactAddress({
        'street': '12 rue de la Paix',
        'postal_code': '75002',
        'city': 'Paris',
        'country': 'France',
      }),
      '12 rue de la Paix, 75002 Paris, France',
    );
  });

  test('huberaMapsDeepLink utilise le schéma Maps existant', () {
    expect(
      huberaMapsDeepLink('12 rue de la Paix, Paris'),
      'hubera-maps://?q=12%20rue%20de%20la%20Paix%2C%20Paris',
    );
    expect(huberaMapsDeepLink('  '), isEmpty);
  });

  test('huberaMapsWebLink pointe vers maps.hubera.cloud', () {
    expect(
      huberaMapsWebLink('Lyon'),
      'https://maps.hubera.cloud/?q=Lyon',
    );
  });

  test('contactAddressQuery lit profile.addresses[0]', () {
    final item = {
      'name': 'Ada',
      'profile': {
        'addresses': [
          {'street': '1 quai', 'city': 'Lyon'},
        ],
      },
    };
    expect(contactAddressQuery(item), '1 quai, Lyon');
  });
}
