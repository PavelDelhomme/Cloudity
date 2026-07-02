import 'package:flutter_test/flutter_test.dart';

import 'package:cloudity_shared/cloudity_datetime.dart';

void main() {
  test('parseCloudityDateTime interprète sans fuseau comme UTC', () {
    final d = parseCloudityDateTime('2026-06-16 12:52:00');
    expect(d, isNotNull);
    expect(d!.hour, DateTime.parse('2026-06-16T12:52:00Z').toLocal().hour);
  });
}
