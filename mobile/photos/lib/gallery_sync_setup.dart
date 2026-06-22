import 'package:photo_manager/photo_manager.dart';

import 'gallery_album_catalog.dart';
import 'gallery_sync_prefs.dart';

/// Au premier lancement de la sauvegarde, propose les dossiers usuels
/// (Appareil photo, Captures, WhatsApp…) s’il n’y a pas encore de sélection.
Future<Set<String>?> applyDefaultAlbumSelectionIfNeeded() async {
  if (await GallerySyncPrefs.hasDefaultAlbumsConfigured()) return null;

  final current = await GallerySyncPrefs.selectedAlbumIds();
  if (current.isNotEmpty) {
    await GallerySyncPrefs.setDefaultAlbumsConfigured(true);
    return null;
  }

  final albums = await PhotoManager.getAssetPathList(
    type: RequestType.image,
    hasAll: false,
  );
  final suggested = suggestedAlbumIds(
    albums.map((a) => GalleryAlbumRef(id: a.id, name: a.name)),
  );

  await GallerySyncPrefs.setDefaultAlbumsConfigured(true);
  if (suggested.isEmpty) return null;

  await GallerySyncPrefs.setSelectedAlbumIds(suggested);
  return suggested;
}
