import 'dart:convert';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('access token local : zéro essai réseau avant le premier écran', () {
    final plan = planSessionRestore(hasAccessToken: true, gatewayCandidates: 4);
    expect(plan.returnLocalAccess, isTrue);
    expect(plan.networkAttempts, 0);
    expect(plan.clearTokensOnTransportError, isFalse);
  });

  test('sans access token : un seul essai, le refresh n’est pas effacé', () {
    final plan = planSessionRestore(hasAccessToken: false, gatewayCandidates: 4);
    expect(plan.returnLocalAccess, isFalse);
    expect(plan.networkAttempts, 1);
    expect(plan.clearTokensOnTransportError, isFalse);
    expect(
      planSessionRestore(hasAccessToken: false, gatewayCandidates: 0).networkAttempts,
      0,
    );
  });

  test('décodage liste locale reste sous 30 ms sans réseau', () {
    final items = [
      for (var i = 0; i < 800; i++)
        {'id': i, 'title': 'Note $i', 'body': 'corps $i' * 4},
    ];
    final frame = measureListDecode(jsonEncode(items));
    expect(frame.items, hasLength(800));
    expect(frame.items.first['title'], 'Note 0');
    expect(frame.decodeUs, lessThan(30000));
    expect(decodeSuiteListCache(''), isEmpty);
    expect(decodeSuiteListCache('{'), isEmpty);
  });
}
