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

  test('seul un échec de transport est une coupure réseau', () {
    expect(isRealNetworkFailure(Exception('SocketException: Connection reset')), isTrue);
    expect(isRealNetworkFailure(Exception('ClientException: Connection closed')), isTrue);
    expect(isRealNetworkFailure(Exception('TimeoutException: timed out')), isTrue);
    expect(isRealNetworkFailure(Exception('HTTP GET /notes → 400: erreur')), isFalse);
    expect(isRealNetworkFailure(Exception('Mail messages HTTP 500')), isFalse);
    expect(isRealNetworkFailure(Exception('Session expirée.')), isFalse);
    expect(
      showCachedSyncBanner(
        error: 'ClientException: Connection refused',
        hasCachedItems: true,
      ),
      isTrue,
    );
    expect(
      showCachedSyncBanner(
        error: 'Mail messages HTTP 500',
        hasCachedItems: true,
      ),
      isFalse,
    );
    expect(
      showCachedSyncBanner(
        error: 'ClientException: Connection refused',
        hasCachedItems: false,
      ),
      isFalse,
    );
  });
}
