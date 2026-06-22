import 'package:flutter/material.dart';

/// Statut d’une photo locale par rapport au cloud Cloudity.
enum PhotoSyncStatus {
  /// Présente dans la bibliothèque cloud Cloudity.
  inCloud,

  /// Sauvegardée sur le cloud (depuis cet appareil).
  backedUp,

  /// Présente localement, sauvegarde active mais pas encore envoyée.
  pendingUpload,

  /// Présente localement, sauvegarde désactivée.
  localOnly,

  /// Disponible uniquement sur le cloud (autre appareil ou original supprimé).
  cloudOnly,
}

class PhotoSyncBadge extends StatelessWidget {
  const PhotoSyncBadge({super.key, required this.status});

  final PhotoSyncStatus status;

  @override
  Widget build(BuildContext context) {
    final (icon, label, color) = switch (status) {
      PhotoSyncStatus.inCloud => (
        Icons.cloud_outlined,
        'Dans le cloud',
        Colors.indigo.shade700,
      ),
      PhotoSyncStatus.backedUp => (
        Icons.cloud_done,
        'Sauvegardée',
        Colors.green.shade700,
      ),
      PhotoSyncStatus.pendingUpload => (
        Icons.cloud_upload_outlined,
        'À sauvegarder',
        Colors.orange.shade800,
      ),
      PhotoSyncStatus.localOnly => (
        Icons.smartphone_outlined,
        'Sur cet appareil',
        Colors.blueGrey.shade700,
      ),
      PhotoSyncStatus.cloudOnly => (
        Icons.cloud_outlined,
        'Cloud uniquement',
        Colors.indigo.shade700,
      ),
    };
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 3),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
