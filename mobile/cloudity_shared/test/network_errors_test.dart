import 'package:cloudity_shared/network_errors.dart';
import 'package:test/test.dart';

void main() {
  test('errno 101 → message Wi‑Fi / gateway', () {
    final msg = friendlyNetworkMessage(
      Exception('ClientException: SocketException: Network is unreachable, errno = 101'),
    );
    expect(msg, contains('Pas de réseau'));
    expect(msg, contains('adb reverse'));
  });

  test('connection refused → message make up', () {
    final msg = friendlyNetworkMessage(
      Exception('Connection refused'),
    );
    expect(msg, contains('ne répond pas'));
  });
}
