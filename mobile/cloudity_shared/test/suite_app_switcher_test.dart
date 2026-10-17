import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    CloudityDesignTokens.loadSyncForTests(const {
      'brand': {'primary': '#2563EB'},
      'radius': {'md': 12},
      'spacing': {'xs': 4, 'sm': 8, 'md': 12, 'lg': 16},
      'apps': {
        'photos': {'accent': '#DB2777', 'accentDark': '#BE185D'},
        'mail': {'accent': '#2563EB'},
      },
    });
  });

  testWidgets('défaut : la liste des apps Hubera reste visible', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: SuiteAppSwitcher(currentApp: ClouditySuiteApp.photos),
          ),
        ),
      ),
    );
    expect(find.text('Apps Hubera'), findsOneWidget);
  });

  testWidgets('showApps false : Photos peut retirer la liste', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SuiteAppSwitcher(
            currentApp: ClouditySuiteApp.photos,
            showApps: false,
          ),
        ),
      ),
    );
    expect(find.text('Apps Hubera'), findsNothing);
  });

  testWidgets('Tasks : le drawer ne liste pas les autres apps', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SuiteDrawerScaffold(
          currentApp: ClouditySuiteApp.tasks,
          title: 'Tâches',
          gatewayUrl: 'https://api.example.test',
          showSettings: false,
          showAppSwitcher: false,
          onOpenSettings: () {},
          onCloseSettings: () {},
          onLogout: () async {},
          navItems: const [
            ListTile(title: Text('Toutes les tâches')),
          ],
          body: const Text('liste'),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Toutes les tâches'), findsOneWidget);
    expect(find.text('Apps Hubera'), findsNothing);
    expect(find.text('Music'), findsNothing);
    expect(find.text('Mail'), findsNothing);
  });
}
