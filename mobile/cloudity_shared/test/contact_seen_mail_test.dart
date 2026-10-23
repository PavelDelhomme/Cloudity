import 'package:cloudity_shared/contact_directory.dart';
import 'package:cloudity_shared/contact_seen_mail.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const library = [
    {'display_name': 'Ada Lovelace', 'email': 'ada@example.com'},
    {'display_name': 'Cabinet Martin', 'email': 'm@cabinet.fr'},
  ];

  test('une adresse qui commence par un point n’est pas proposée', () {
    final hits = emailRecipientSuggestions(
      library: [
        ...library,
        {'display_name': 'Point', 'email': '.cache@example.com'},
        {'display_name': '.Bot', 'email': 'bot@example.com'},
      ],
      alreadySeen: const [
        SeenMailAddress(email: '.notification@svc.test', name: 'Alertes'),
        SeenMailAddress(email: 'notify@svc.test', name: '.GitHub'),
      ],
      query: '',
    );
    final emails = hits.map((s) => s.email).toList();
    expect(emails, isNot(contains('.cache@example.com')));
    expect(emails, isNot(contains('.notification@svc.test')));
    expect(emails, isNot(contains('bot@example.com')));
    expect(emails, isNot(contains('notify@svc.test')));
    expect(emails, contains('ada@example.com'));
  });

  test('une adresse déjà vue absente de la bibliothèque est proposée', () {
    final hits = emailRecipientSuggestions(
      library: library,
      alreadySeen: const [
        SeenMailAddress(name: 'Camille Martin', email: 'camille@example.com'),
      ],
      query: 'cam',
    );
    expect(hits.map((s) => s.email), ['camille@example.com']);
    expect(hits.single.name, 'Camille Martin');
  });

  test('une adresse absente des mails et de la bibliothèque n’est pas inventée', () {
    final hits = emailRecipientSuggestions(
      library: library,
      alreadySeen: const [
        SeenMailAddress(name: 'Camille Martin', email: 'camille@example.com'),
      ],
      query: 'ghost',
    );
    expect(hits, isEmpty);
  });

  test('une adresse déjà dans la bibliothèque n’est pas doublée', () {
    final hits = emailRecipientSuggestions(
      library: library,
      alreadySeen: const [
        SeenMailAddress(name: 'Autre nom', email: 'ada@example.com'),
      ],
    );
    expect(hits.where((s) => s.email == 'ada@example.com'), hasLength(1));
    expect(hits.firstWhere((s) => s.email == 'ada@example.com').name, 'Ada Lovelace');
  });

  test('les en-têtes déjà lus ne fabriquent pas d’adresse', () {
    final seen = seenMailAddressesFromMessages(const [
      {'from': 'Camille Martin <camille@example.com>', 'subject': 'bonjour'},
      {'from': '.notification@svc.test'},
    ]);
    expect(seen.map((s) => s.email), ['camille@example.com', '.notification@svc.test']);
    final hits = emailRecipientSuggestions(library: library, alreadySeen: seen);
    expect(hits.map((s) => s.email), isNot(contains('.notification@svc.test')));
    expect(hits.map((s) => s.email), contains('camille@example.com'));
  });

  test('un contact sans e-mail n’est pas proposé, et le libellé réel est gardé', () {
    final hits = emailRecipientSuggestions(
      library: [
        {
          'display_name': 'Camille Martin',
          'profile': {
            'emails': [
              {'label': 'home', 'value': 'camille.home@example.com'},
              {'label': 'work', 'value': 'camille.work@example.com'},
            ],
          },
        },
        {'display_name': 'Atelier Labo', 'phone': '0600000000'},
        {'display_name': 'Seul', 'email': 'seul@example.com'},
      ],
      alreadySeen: const [],
    );
    expect(hits.map((s) => s.name), isNot(contains('Atelier Labo')));
    final camille = hits.where((s) => s.name == 'Camille Martin').toList();
    expect(camille.map((s) => s.label), ['home', 'work']);
    expect(hits.singleWhere((s) => s.email == 'seul@example.com').label, isEmpty);
  });

  test('le switch Personnel / Professionnel ne mélange pas les listes', () {
    const hubera = [
      {'id': 1, 'display_name': 'Cabinet Martin', 'email': 'm@cabinet.fr'},
    ];
    const device = [
      {
        'display_name': 'Maman',
        'email': 'maman@gmail.com',
        'account_type': 'com.google',
        'lookup': '7',
      },
    ];
    final personal = personalContactsFromDevice(device);
    final pro = contactsForDirectory(
      hubera: hubera,
      device: personal,
      directory: ContactDirectory.professional,
    );
    final perso = contactsForDirectory(
      hubera: hubera,
      device: personal,
      directory: ContactDirectory.personal,
    );
    expect(pro.map((e) => e['email']), ['m@cabinet.fr']);
    expect(perso.map((e) => e['email']), ['maman@gmail.com']);
    expect(pro.any((e) => e['email'] == 'maman@gmail.com'), isFalse);
    expect(perso.any((e) => e['email'] == 'm@cabinet.fr'), isFalse);
  });
}
