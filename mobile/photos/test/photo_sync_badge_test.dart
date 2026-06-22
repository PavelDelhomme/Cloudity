import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_photos/photo_sync_badge.dart';

void main() {
  testWidgets('PhotoSyncBadge affiche les libellés de statut', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              PhotoSyncBadge(status: PhotoSyncStatus.inCloud),
              PhotoSyncBadge(status: PhotoSyncStatus.backedUp),
              PhotoSyncBadge(status: PhotoSyncStatus.pendingUpload),
              PhotoSyncBadge(status: PhotoSyncStatus.localOnly),
              PhotoSyncBadge(status: PhotoSyncStatus.cloudOnly),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Dans le cloud'), findsOneWidget);
    expect(find.text('Sauvegardée'), findsOneWidget);
    expect(find.text('À sauvegarder'), findsOneWidget);
    expect(find.text('Sur cet appareil'), findsOneWidget);
    expect(find.text('Cloud uniquement'), findsOneWidget);
  });
}
