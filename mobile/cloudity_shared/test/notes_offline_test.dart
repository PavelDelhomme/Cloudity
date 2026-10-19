import 'package:cloudity_shared/notes_offline.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const draft = OfflineNoteDraft(token: 'a', title: 'Hors ligne', content: 'nuit');

  test('un brouillon hors-ligne reste visible tant que le serveur ne l’a pas', () {
    final shown = notesWithOfflineDrafts(const [], [draft]);
    expect(shown, hasLength(1));
    expect(shown.single['title'], 'Hors ligne');
    expect(shown.single['_offline'], isTrue);
  });

  test('le retour réseau ne montre pas une seconde copie', () {
    final server = [
      {'id': 4, 'title': 'Hors ligne', 'content': 'nuit'},
    ];
    expect(offlineDraftsStillMissing([draft], server), isEmpty);
    expect(notesWithOfflineDrafts(server, [draft]), hasLength(1));
    expect(notesWithOfflineDrafts(server, [draft]).single['id'], 4);
  });
}
