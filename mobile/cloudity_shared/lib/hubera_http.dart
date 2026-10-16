import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

/// Échec DNS (errno 7) : la requête n’a pas quitté le téléphone.
bool huberaIsDnsFailure(Object error) {
  final raw = error.toString().toLowerCase();
  return raw.contains('failed host lookup') ||
      raw.contains('no address associated') ||
      raw.contains('name or service not known') ||
      raw.contains('errno = 7') ||
      raw.contains('errno=7');
}

/// Coupure de transport après le début de la connexion
/// (errno 103 « Software caused connection abort », reset, fermeture, délai).
bool huberaIsTransportReset(Object error) {
  if (error is TimeoutException) return true;
  if (error is HandshakeException || error is TlsException) return false;
  final raw = error.toString().toLowerCase();
  if (raw.contains('certificate') || raw.contains('handshake')) return false;
  return raw.contains('connection abort') ||
      raw.contains('software caused connection abort') ||
      raw.contains('errno = 103') ||
      raw.contains('connection reset') ||
      raw.contains('connection closed') ||
      raw.contains('connection refused') ||
      raw.contains('network is unreachable') ||
      raw.contains('errno = 101') ||
      raw.contains('connection timed out') ||
      raw.contains('timed out');
}

/// [idempotent] : on peut renvoyer la requête. Un POST d’envoi ne l’est pas,
/// un GET ou une sync IMAP oui. Un échec DNS est toujours rejouable :
/// rien n’a été envoyé.
bool huberaCanRetry(Object error, {required bool idempotent}) {
  if (huberaIsDnsFailure(error)) return true;
  final raw = error.toString().toLowerCase();
  // Refus ou réseau absent : le serveur n’a pas reçu la requête.
  if (raw.contains('connection refused') ||
      raw.contains('network is unreachable') ||
      raw.contains('errno = 101') ||
      raw.contains('errno = 111')) {
    return true;
  }
  if (!idempotent) return false;
  return huberaIsTransportReset(error);
}

typedef HuberaLookup = Future<List<InternetAddress>> Function(
  String host, {
  InternetAddressType type,
});

class _CachedAddr {
  _CachedAddr(this.addr, this.at);
  final InternetAddress addr;
  final DateTime at;
}

/// Résolution IPv4 partagée. Sur le Nothing, `getaddrinfo` (AF_UNSPEC)
/// renvoie errno 7 pour `id.hubera.cloud` alors que le ping IPv4 réussit,
/// dès que Mail lance plusieurs recherches en parallèle.
class HuberaHostResolver {
  HuberaHostResolver({HuberaLookup? lookup, this.delay = Future<void>.delayed})
      : _lookup = lookup ?? InternetAddress.lookup;

  static final HuberaHostResolver shared = HuberaHostResolver();

  final HuberaLookup _lookup;
  final Future<void> Function(Duration) delay;
  final Map<String, _CachedAddr> _cache = {};
  final Map<String, Future<InternetAddress>> _inflight = {};
  static const _ttl = Duration(minutes: 2);

  void invalidate(String host) {
    _cache.remove(host);
  }

  Future<InternetAddress> resolve(String host) {
    final now = DateTime.now();
    final hit = _cache[host];
    if (hit != null && now.difference(hit.at) < _ttl) {
      return Future<InternetAddress>.value(hit.addr);
    }
    final pending = _inflight[host];
    if (pending != null) return pending;
    final future = _resolveFresh(host);
    _inflight[host] = future;
    return future.whenComplete(() {
      if (identical(_inflight[host], future)) _inflight.remove(host);
    });
  }

  Future<InternetAddress> _resolveFresh(String host) async {
    Object? last;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final chosen = await _lookupIpv4(host);
        _cache[host] = _CachedAddr(chosen, DateTime.now());
        return chosen;
      } catch (e) {
        last = e;
        if (attempt < 2) await delay(Duration(milliseconds: 200 * (attempt + 1)));
      }
    }
    final stale = _cache[host];
    if (stale != null) return stale.addr;
    throw last ?? SocketException("Failed host lookup: '$host'");
  }

  Future<InternetAddress> _lookupIpv4(String host) async {
    var list = await _lookup(host, type: InternetAddressType.IPv4);
    if (list.isEmpty) {
      list = await _lookup(host, type: InternetAddressType.any);
    }
    final v4 = list.where((a) => a.type == InternetAddressType.IPv4).toList();
    if (v4.isNotEmpty) return v4.first;
    if (list.isNotEmpty) return list.first;
    throw SocketException("Failed host lookup: '$host'");
  }
}

/// Client HTTP unique vers Hubera ID.
///
/// `package:http` ouvrait un [HttpClient] par appel et le fermait dans un
/// `finally`. Sur le Nothing ça multiplie les `getaddrinfo` (errno 7) et
/// l’abandon de socket (« Software caused connection abort », errno 103).
class HuberaHttp {
  HuberaHttp({HuberaHostResolver? resolver, http.Client? client})
      : _resolver = resolver ?? HuberaHostResolver.shared,
        _client = client ?? IOClient(_openClient(resolver ?? HuberaHostResolver.shared));

  static final HuberaHttp shared = HuberaHttp();

  final HuberaHostResolver _resolver;
  final http.Client _client;

  static HttpClient _openClient(HuberaHostResolver resolver) {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 12);
    client.idleTimeout = const Duration(seconds: 8);
    client.maxConnectionsPerHost = 4;
    client.findProxy = (_) => 'DIRECT';
    client.connectionFactory = (uri, proxyHost, proxyPort) {
      return _connect(resolver, uri);
    };
    return client;
  }

  static Future<ConnectionTask<Socket>> _connect(HuberaHostResolver resolver, Uri uri) async {
    final addr = await resolver.resolve(uri.host);
    final port = uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80);
    if (uri.scheme != 'https') {
      return Socket.startConnect(addr, port);
    }
    final rawTask = await Socket.startConnect(addr, port);
    var cancelled = false;
    final Future<Socket> secure = rawTask.socket.then<Socket>((raw) async {
      if (cancelled) {
        raw.destroy();
        throw const SocketException('Connection attempt cancelled');
      }
      return SecureSocket.secure(raw, host: uri.host);
    });
    return ConnectionTask.fromSocket<Socket>(secure, () {
      cancelled = true;
      rawTask.cancel();
    });
  }

  Future<http.Response> get(
    Uri url, {
    Map<String, String>? headers,
    Duration? timeout,
  }) {
    return _send(
      () => _client.get(url, headers: headers),
      timeout: timeout,
      idempotent: true,
      host: url.host,
    );
  }

  Future<http.Response> post(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
    bool idempotent = false,
  }) {
    return _send(
      () => _client.post(url, headers: headers, body: body),
      timeout: timeout,
      idempotent: idempotent,
      host: url.host,
    );
  }

  Future<http.Response> patch(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
    bool idempotent = true,
  }) {
    return _send(
      () => _client.patch(url, headers: headers, body: body),
      timeout: timeout,
      idempotent: idempotent,
      host: url.host,
    );
  }

  Future<http.Response> _send(
    Future<http.Response> Function() send, {
    required Duration? timeout,
    required bool idempotent,
    required String host,
  }) async {
    Object? last;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final future = send();
        if (timeout == null) return await future;
        return await future.timeout(timeout);
      } catch (e) {
        last = e;
        final again = attempt < 2 && huberaCanRetry(e, idempotent: idempotent);
        if (!again) throw e;
        if (huberaIsDnsFailure(e)) _resolver.invalidate(host);
        await Future<void>.delayed(Duration(milliseconds: 250 * (attempt + 1)));
      }
    }
    throw last ?? StateError('requête Hubera sans résultat');
  }
}

final HuberaHttp huberaHttp = HuberaHttp.shared;
