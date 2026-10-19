import 'package:cloudity_shared/tasks_offline.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const draft = OfflineTaskDraft(token: 'a', title: 'Hors ligne');

  test('un brouillon hors-ligne reste visible tant que le serveur ne l’a pas', () {
    final shown = tasksWithOfflineDrafts(const [], [draft]);
    expect(shown, hasLength(1));
    expect(shown.single['title'], 'Hors ligne');
    expect(shown.single['_offline'], isTrue);
  });

  test('le retour réseau ne montre pas une seconde copie', () {
    final server = [
      {'id': 4, 'title': 'Hors ligne', 'completed': false},
    ];
    expect(offlineTasksStillMissing([draft], server), isEmpty);
    expect(tasksWithOfflineDrafts(server, [draft]), hasLength(1));
    expect(tasksWithOfflineDrafts(server, [draft]).single['id'], 4);
  });

  test('le filtre Faites ne montre que les tâches cochées', () {
    final items = [
      {'id': 1, 'title': 'Ouverte', 'completed': false},
      {'id': 2, 'title': 'Faite', 'completed': true},
    ];
    expect(tasksForDoneFilter(items, doneOnly: false).single['title'], 'Ouverte');
    expect(tasksForDoneFilter(items, doneOnly: true).single['title'], 'Faite');
  });
}
