import 'package:cloudity_shared/calendar_drive.dart';
import 'package:cloudity_shared/calendar_event_page.dart';
import 'package:cloudity_shared/suite_product_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('création : titre, horaire, agenda, répétition, notification, lieu, Drive', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CalendarEventPage(
          api: SuiteProductApi(gatewayBase: 'http://127.0.0.1:9', accessToken: 'tok'),
          calendars: const [
            {'id': 1, 'name': 'Paul', 'color_hex': '#1a73e8'},
          ],
          driveProbe: () async => (reachable: false, files: const <DriveFileRef>[]),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Ajouter un titre'), findsOneWidget);
    expect(find.text('Toute la journée'), findsOneWidget);
    expect(find.text('Début'), findsOneWidget);
    expect(find.text('Fin'), findsOneWidget);
    expect(find.text('Agenda'), findsOneWidget);
    expect(find.text('Répétition'), findsOneWidget);
    expect(find.text('Notification'), findsOneWidget);
    expect(find.text('Lieu'), findsOneWidget);
    expect(find.text('Description'), findsOneWidget);

    await tester.tap(find.byKey(const Key('calendar-event-drive')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Il faut Hubera Drive'), findsOneWidget);
  });
}
