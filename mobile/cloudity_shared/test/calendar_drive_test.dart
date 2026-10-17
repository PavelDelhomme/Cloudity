import 'package:cloudity_shared/calendar_drive.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ne garde que les fichiers Drive', () {
    final files = parseDriveFileList([
      {'id': 1, 'name': 'Dossier', 'is_folder': true},
      {'id': 2, 'name': 'Contrat.pdf', 'is_folder': false},
      {'id': '3', 'name': 'Photo.jpg'},
    ]);
    expect(files.map((f) => f.name), ['Contrat.pdf', 'Photo.jpg']);
  });

  test('pièces déjà enregistrées, y compris en JSON texte', () {
    final files = readEventAttachments('[{"id":9,"name":"Devis.odt"}]');
    expect(files, hasLength(1));
    expect(files.single.id, 9);
  });

  test('réponse Drive illisible ne jette pas', () {
    expect(parseDriveFileList('nope'), isEmpty);
    expect(parseDriveFileList(null), isEmpty);
  });
}
