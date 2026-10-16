import 'package:cloudity_shared/contact_directory.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const hubera = [
    {'id': 1, 'display_name': 'Cabinet Martin', 'email': 'm@cabinet.fr'},
    {'id': 2, 'display_name': 'Paul Hubera', 'email': 'paul@hubera.cloud'},
  ];

  const deviceRaw = [
    {
      'display_name': 'Maman',
      'email': 'maman@gmail.com',
      'phone': '0600000000',
      'account_type': 'com.google',
      'password': 'ne-pas-garder',
      'lookup': '44',
    },
    {
      'display_name': 'Samsung Pro',
      'email': 'pro@samsung.com',
      'account_type': 'com.samsung.android.exchange',
    },
  ];

  test('le switch Personnel / Professionnel change la liste', () {
    final personalSource = personalContactsFromDevice(deviceRaw);
    final pro = contactsForDirectory(
      hubera: hubera,
      device: personalSource,
      directory: ContactDirectory.professional,
    );
    final perso = contactsForDirectory(
      hubera: hubera,
      device: personalSource,
      directory: ContactDirectory.personal,
    );

    expect(pro.map((e) => e['display_name']), ['Cabinet Martin', 'Paul Hubera']);
    expect(perso.map((e) => e['display_name']), ['Maman']);
    expect(pro, isNot(equals(perso)));
  });

  test('l’import Google ne mélange pas pro et perso et garde Hubera', () {
    final split = splitDeviceGoogleImport(hubera: hubera, deviceRaw: deviceRaw);

    expect(split.professional.length, hubera.length);
    expect(split.professional.map((e) => e['id']), [1, 2]);
    expect(split.professional.map((e) => e['email']), [
      'm@cabinet.fr',
      'paul@hubera.cloud',
    ]);
    expect(split.professional.any(isDeviceGoogleContact), isFalse);
    expect(split.personal, hasLength(1));
    expect(split.personal.single['display_name'], 'Maman');
    expect(split.personal.single['source'], kDeviceGoogleSource);
    expect(split.personal.single['hubera_directory'], 'personal');
    expect(split.personal.single.containsKey('password'), isFalse);
    expect(
      split.personal.any((e) => e['display_name'] == 'Cabinet Martin'),
      isFalse,
    );
    expect(
      split.professional.any((e) => e['email'] == 'maman@gmail.com'),
      isFalse,
    );
    expect(
      contactsForDirectory(
        hubera: split.professional,
        device: split.personal,
        directory: ContactDirectory.professional,
      ).any((e) => e['email'] == 'maman@gmail.com'),
      isFalse,
    );
  });
}
