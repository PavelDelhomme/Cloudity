import 'dart:async';
import 'dart:io';

import 'package:cloudity_shared/hubera_http.dart';
import 'package:test/test.dart';

void main() {
  test('errno 7 se rejoue, un HTTP 400 non', () {
    final dns = const SocketException(
      "Failed host lookup: 'id.hubera.cloud' (OS Error: No address associated with hostname, errno = 7)",
    );
    expect(huberaIsDnsFailure(dns), isTrue);
    expect(huberaCanRetry(dns, idempotent: false), isTrue);

    final abort = Exception(
      'ClientException with SocketException: Software caused connection abort, errno = 103, uri=https://id.hubera.cloud/mail/me/accounts',
    );
    expect(huberaIsTransportReset(abort), isTrue);
    expect(huberaCanRetry(abort, idempotent: true), isTrue);
    expect(huberaCanRetry(abort, idempotent: false), isFalse);

    expect(
      huberaCanRetry(Exception('Mail messages HTTP 400'), idempotent: true),
      isFalse,
    );
    expect(
      huberaCanRetry(
        const HandshakeException('CERTIFICATE_VERIFY_FAILED'),
        idempotent: true,
      ),
      isFalse,
    );
  });

  test('la résolution IPv4 réessaie après errno 7', () async {
    var calls = 0;
    final resolver = HuberaHostResolver(
      delay: (_) async {},
      lookup: (host, {type = InternetAddressType.any}) async {
        calls++;
        if (calls < 3) {
          throw const SocketException(
            "Failed host lookup: 'id.hubera.cloud'",
            osError: OSError('No address associated with hostname', 7),
          );
        }
        return [InternetAddress('95.111.227.204')];
      },
    );
    final addr = await resolver.resolve('id.hubera.cloud');
    expect(addr.address, '95.111.227.204');
    expect(calls, 3);
    final again = await resolver.resolve('id.hubera.cloud');
    expect(again.address, '95.111.227.204');
    expect(calls, 3);
  });

  test('les recherches parallèles partagent un seul lookup', () async {
    final gate = Completer<void>();
    var calls = 0;
    final resolver = HuberaHostResolver(
      delay: (_) async {},
      lookup: (host, {type = InternetAddressType.any}) async {
        calls++;
        await gate.future;
        return [InternetAddress('95.111.227.204')];
      },
    );
    final pending = Future.wait([
      resolver.resolve('id.hubera.cloud'),
      resolver.resolve('id.hubera.cloud'),
    ]);
    gate.complete();
    final results = await pending;
    expect(results[0].address, '95.111.227.204');
    expect(results[1].address, results[0].address);
    expect(calls, 1);
  });
}
