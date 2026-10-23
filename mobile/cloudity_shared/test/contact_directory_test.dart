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

  test('déplacer vers Personnel ne duplique pas la fiche', () {
    const hubera = [
      {'id': 1, 'display_name': 'Cabinet Martin', 'email': 'm@cabinet.fr'},
      {'id': 2, 'display_name': 'Paul Hubera', 'email': 'paul@hubera.cloud'},
    ];
    final device = personalContactsFromDevice(deviceRaw);
    final moved = const ContactPlacement().assignDirectory(
      keys: const ['h:1'],
      directory: 'personal',
    );
    final pro = contactsOnShelf(
      hubera: hubera,
      device: device,
      placement: moved,
      directory: ContactDirectory.professional,
    );
    final perso = contactsOnShelf(
      hubera: hubera,
      device: device,
      placement: moved,
      directory: ContactDirectory.personal,
    );

    expect(pro.map((e) => e['display_name']), ['Paul Hubera']);
    expect(perso.map((e) => e['display_name']), ['Cabinet Martin', 'Maman']);
    expect(perso.where((e) => e['id'] == 1), hasLength(1));
    expect(hubera, hasLength(2));
    expect(device, hasLength(1));
  });

  test('deux fiches de la même personne dans le même annuaire n’en font qu’une', () {
    const hubera = [
      {'id': 4, 'display_name': 'Maman', 'email': 'maman@gmail.com', 'phone': '0600000000'},
    ];
    final device = personalContactsFromDevice(deviceRaw);
    final moved = const ContactPlacement().assignDirectory(
      keys: const ['d:44'],
      directory: 'professional',
    );
    final pro = contactsOnShelf(
      hubera: hubera,
      device: device,
      placement: moved,
      directory: ContactDirectory.professional,
    );
    expect(pro, hasLength(1));
    expect(pro.single['id'], 4);
  });

  test('corbeille et archive : détail au retour, pas la liste principale', () {
    const hubera = [
      {'id': 1, 'display_name': 'Cabinet Martin', 'email': 'm@cabinet.fr'},
      {'id': 2, 'display_name': 'Paul Hubera', 'email': 'paul@hubera.cloud'},
    ];
    final trashed = const ContactPlacement().moveToTrash(
      keys: const ['h:1'],
      at: '2026-10-17T12:00:00Z',
    );
    final archived = trashed.moveToArchive(keys: const ['h:2']);
    expect(
      contactsOnShelf(hubera: hubera, device: const [], placement: archived),
      isEmpty,
    );
    expect(
      contactsOnShelf(
        hubera: hubera,
        device: const [],
        placement: archived,
        shelf: ContactShelf.trash,
      ).single['id'],
      1,
    );
    expect(
      contactsOnShelf(
        hubera: hubera,
        device: const [],
        placement: archived,
        shelf: ContactShelf.archive,
      ).single['id'],
      2,
    );
    final restored = archived.restore(keys: const ['h:1']);
    expect(
      contactsOnShelf(
        hubera: hubera,
        device: const [],
        placement: restored,
        directory: ContactDirectory.professional,
      ).single['id'],
      1,
    );
    expect(contactShelfAfterDetail(ContactShelf.trash), ContactShelf.trash);
    expect(contactShelfAfterDetail(ContactShelf.archive), ContactShelf.archive);
    expect(contactScrollRestore(480, 900), 480);
    expect(contactScrollRestore(1200, 900), 900);
    expect(contactScrollRestore(-4, 900), 0);
  });

  test('création : déjà autorisé, on ne redemande pas', () {
    expect(
      contactCreatePermission(alreadyGranted: true),
      ContactCreatePermission.proceed,
    );
    expect(
      contactCreatePermission(alreadyGranted: true, asked: false),
      ContactCreatePermission.proceed,
    );
    expect(
      contactCreatePermission(alreadyGranted: false),
      ContactCreatePermission.askOnce,
    );
    expect(
      contactCreatePermission(alreadyGranted: false, asked: true),
      ContactCreatePermission.proceed,
    );
    expect(
      contactCreatePermission(alreadyGranted: false, asked: false),
      ContactCreatePermission.stop,
    );
  });

  test('numéro bloqué seulement si le téléphone le relit', () {
    final hidden = blockedNumbersFromChannel(const {
      'canRead': false,
      'canWrite': false,
      'reason': 'Réservé à l’application Téléphone.',
      'numbers': [
        {'number': '0600000000'},
      ],
    });
    expect(hidden.canRead, isFalse);
    expect(hidden.numbers, isEmpty);

    final open = blockedNumbersFromChannel(const {
      'canRead': true,
      'canWrite': true,
      'numbers': [
        {'number': '0611111111'},
      ],
    });
    expect(open.numbers, ['0611111111']);

    final refused = interpretBlockResult(
      raw: const {'ok': false, 'reason': 'Le téléphone a refusé.'},
      number: '0622222222',
      reread: const [],
    );
    expect(refused.blocked, isFalse);

    final pretended = interpretBlockResult(
      raw: const {'ok': true},
      number: '0622222222',
      reread: const ['0611111111'],
    );
    expect(pretended.blocked, isFalse);

    final kept = interpretBlockResult(
      raw: const {'ok': true},
      number: '06 22 22 22 22',
      reread: const ['+33622222222'],
    );
    expect(kept.blocked, isTrue);
  });

  test('un favori reste dans la liste', () {
    final placed = const ContactPlacement().toggleFavorite('h:1');
    final visible = contactsOnShelf(
      hubera: hubera,
      device: const [],
      placement: placed,
      directory: ContactDirectory.professional,
    );
    expect(visible.map((e) => e['display_name']), ['Cabinet Martin', 'Paul Hubera']);
    expect(
      contactFavorites(visible, placed.favorites).map((e) => e['display_name']),
      ['Cabinet Martin'],
    );
    final round = ContactPlacement.fromJson(placed.toJson());
    expect(round.favorites, {'h:1'});
  });

  test('les propositions suivent les ouvertures et n’inventent pas de nom', () {
    final items = [
      {'id': 1, 'display_name': 'Essai Local'},
      {'id': 2, 'display_name': 'Atelier Labo'},
      {'id': 3, 'display_name': 'Autre'},
    ];
    expect(contactSuggestionsByViews(items, const {}), isEmpty);
    expect(
      contactSuggestionsByViews(items, const {'h:2': 1}).map((e) => e['display_name']),
      ['Atelier Labo'],
    );
    expect(
      contactSuggestionsByViews(items, const {'h:2': 1, 'h:1': 4}).map((e) => e['display_name']),
      ['Essai Local', 'Atelier Labo'],
    );
  });
}
