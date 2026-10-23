import 'package:cloudity_shared/ota_update.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('une mise à jour interrompue se reprend, sans bloquer le compte', () {
    expect(
      cloudityOtaAccountTitle(
        live: false,
        partial: true,
        readyTitle: 'Mettre à jour l’application',
      ),
      cloudityOtaResumeTitle,
    );
    expect(
      cloudityOtaAccountTitle(
        live: true,
        partial: true,
        readyTitle: 'Mettre à jour l’application',
      ),
      cloudityOtaResumeLiveTitle,
    );
    expect(
      cloudityOtaAccountTitle(
        live: false,
        partial: false,
        readyTitle: 'Mettre à jour l’application',
      ),
      'Mettre à jour l’application',
    );
    const blocked = 'mise à jour déjà en cours';
    expect(cloudityOtaResumeTitle.toLowerCase().contains(blocked), isFalse);
    expect(cloudityOtaResumeLiveTitle.toLowerCase().contains(blocked), isFalse);
    expect(cloudityOtaInterruptedNote.toLowerCase().contains(blocked), isFalse);
  });
}
