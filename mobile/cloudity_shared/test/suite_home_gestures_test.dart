import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('liste vide efface le cache d’accueil, une liste réelle le garde', () {
    expect(suiteHomeCachePayload(const []), isNull);
    final raw = suiteHomeCachePayload(const [
      {'display_name': 'Ada'},
    ]);
    expect(raw, contains('Ada'));
  });

  test('retour Tasks : filtre puis accueil, sans quitter', () {
    expect(tasksFilterBack(selectedListId: 3), isTrue);
    expect(tasksFilterBack(query: 'courses'), isTrue);
    expect(tasksFilterBack(), isFalse);
    expect(decideSuiteRootBack(showSettings: false), SuiteRootBack.stay);
  });

  test('Cook colle la barre, les autres apps gardent la marge', () {
    expect(
      suiteBottomBarOuterPadding(flush: true, viewPaddingBottom: 48),
      EdgeInsets.zero,
    );
    expect(
      suiteBottomBarOuterPadding(flush: false, viewPaddingBottom: 48),
      const EdgeInsets.only(bottom: 48),
    );
  });

  test('retour accueil ne quitte pas, paramètres se ferment', () {
    expect(
      decideSuiteRootBack(showSettings: false),
      SuiteRootBack.stay,
    );
    expect(
      decideSuiteRootBack(showSettings: true, pageHandlesBack: true),
      SuiteRootBack.closeSettings,
    );
    expect(
      decideSuiteRootBack(showSettings: false, pageHandlesBack: true),
      SuiteRootBack.handledByPage,
    );
  });

  testWidgets('retour système sur Contacts ne retire pas l’accueil', (tester) async {
    var settings = true;
    var closed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return SuiteDrawerScaffold(
              currentApp: ClouditySuiteApp.contacts,
              title: settings ? 'Paramètres' : 'Contacts',
              gatewayUrl: 'https://api.hubera.cloud',
              showSettings: settings,
              showAppSwitcher: false,
              onOpenSettings: () {},
              onCloseSettings: () {
                setState(() {
                  settings = false;
                  closed += 1;
                });
              },
              onLogout: () async {},
              settingsBody: const Text('réglages contacts'),
              body: const Text('liste contacts'),
            );
          },
        ),
      ),
    );

    expect(find.text('réglages contacts'), findsOneWidget);
    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    await navigator.maybePop();
    await tester.pump();
    expect(closed, 1);
    expect(find.text('liste contacts'), findsOneWidget);
    expect(find.text('réglages contacts'), findsNothing);

    await navigator.maybePop();
    await tester.pump();
    expect(find.text('liste contacts'), findsOneWidget);
    expect(navigator.canPop(), isFalse);
  });
}
