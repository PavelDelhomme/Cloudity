import 'package:photo_manager/photo_manager.dart';

const galleryPermissionRequestOption = PermissionRequestOption(
  androidPermission: AndroidPermission(
    type: RequestType.image,
    mediaLocation: false,
  ),
);

bool hasGalleryAccess(PermissionState state) {
  return state == PermissionState.authorized ||
      state == PermissionState.limited;
}

String galleryPermissionMessage(PermissionState state) {
  return switch (state) {
    PermissionState.authorized => 'Acces complet aux photos autorise.',
    PermissionState.limited =>
      'Acces limite autorise : seules les photos selectionnees par Android seront sauvegardees.',
    PermissionState.denied =>
      'Permission galerie refusee. Autorise Photos dans les reglages Android pour lancer la sauvegarde.',
    PermissionState.restricted =>
      'Acces galerie bloque par Android ou par une politique appareil.',
    PermissionState.notDetermined =>
      'Permission galerie necessaire pour sauvegarder les photos.',
  };
}

Future<PermissionState> requestGalleryPermission() {
  return PhotoManager.requestPermissionExtend(
    requestOption: galleryPermissionRequestOption,
  );
}
