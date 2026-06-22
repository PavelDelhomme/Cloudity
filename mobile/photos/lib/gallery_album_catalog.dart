enum GalleryAlbumKind {
  camera,
  screenshots,
  messaging,
  downloads,
  edited,
  other,
}

class GalleryAlbumPresentation {
  const GalleryAlbumPresentation({
    required this.kind,
    required this.label,
    required this.suggested,
  });

  final GalleryAlbumKind kind;
  final String label;
  final bool suggested;
}

GalleryAlbumPresentation describeGalleryAlbum(String rawName) {
  final name = rawName.trim();
  final normalized = name
      .toLowerCase()
      .replaceAll(RegExp(r'[_-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ');

  if (_containsAny(normalized, const [
    'camera',
    'appareil photo',
    'dcim',
    'pixel camera',
    'samsung camera',
  ])) {
    return const GalleryAlbumPresentation(
      kind: GalleryAlbumKind.camera,
      label: 'Appareil photo',
      suggested: true,
    );
  }

  if (_containsAny(normalized, const [
    'screenshot',
    'screenshots',
    'capture',
    'captures',
    'screen recordings',
  ])) {
    return const GalleryAlbumPresentation(
      kind: GalleryAlbumKind.screenshots,
      label: 'Captures d’écran',
      suggested: true,
    );
  }

  if (_containsAny(normalized, const [
    'whatsapp',
    'telegram',
    'signal',
    'messenger',
    'instagram',
    'snapchat',
  ])) {
    return const GalleryAlbumPresentation(
      kind: GalleryAlbumKind.messaging,
      label: 'Images de messagerie',
      suggested: true,
    );
  }

  if (_containsAny(normalized, const [
    'download',
    'downloads',
    'téléchargement',
    'telechargement',
  ])) {
    return const GalleryAlbumPresentation(
      kind: GalleryAlbumKind.downloads,
      label: 'Téléchargements',
      suggested: false,
    );
  }

  if (_containsAny(normalized, const [
    'edited',
    'retouch',
    'lightroom',
    'snapseed',
    'canva',
  ])) {
    return const GalleryAlbumPresentation(
      kind: GalleryAlbumKind.edited,
      label: 'Images modifiées',
      suggested: false,
    );
  }

  return GalleryAlbumPresentation(
    kind: GalleryAlbumKind.other,
    label: name.isEmpty ? 'Dossier photo' : name,
    suggested: false,
  );
}

/// Référence minimale d’un album `photo_manager`.
class GalleryAlbumRef {
  const GalleryAlbumRef({required this.id, required this.name});

  final String id;
  final String name;
}

/// Retourne les IDs des albums recommandés (Camera, Screenshots, messagerie…).
Set<String> suggestedAlbumIds(Iterable<GalleryAlbumRef> albums) {
  final out = <String>{};
  for (final album in albums) {
    if (describeGalleryAlbum(album.name).suggested) {
      out.add(album.id);
    }
  }
  return out;
}

bool _containsAny(String value, List<String> needles) {
  return needles.any(value.contains);
}
