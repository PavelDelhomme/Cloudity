import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'network_errors.dart';
import 'suite_app_catalog.dart';
import 'suite_gateway_config.dart';

/// Remontée crash / feedback mobile (aligné JobbingTrack, adapté suite Cloudity).
class CloudityCrashReporter {
  CloudityCrashReporter._();

  static ClouditySuiteApp? _product;
  static String? _gatewayBase;
  static String? _authToken;
  static String? _userEmail;
  static bool _initialized = false;
  static final List<Map<String, dynamic>> _pending = [];
  static const _pendingFile = 'cloudity_crash_pending.jsonl';

  static void configure({
    required ClouditySuiteApp product,
    String? gatewayBase,
  }) {
    _product = product;
    if (gatewayBase != null && gatewayBase.trim().isNotEmpty) {
      _gatewayBase = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');
    }
  }

  static void setSession({
    String? accessToken,
    String? userEmail,
    String? gatewayBase,
  }) {
    if (gatewayBase != null && gatewayBase.trim().isNotEmpty) {
      _gatewayBase = gatewayBase.trim().replaceAll(RegExp(r'/$'), '');
    }
    _authToken = accessToken;
    _userEmail = userEmail;
    unawaited(flushPending());
  }

  static void clearSession() {
    _authToken = null;
    _userEmail = null;
  }

  static void initialize() {
    if (_initialized) return;
    _initialized = true;

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      final msg = details.exceptionAsString();
      if (_isIgnorable(msg)) return;
      unawaited(
        report(
          crashType: 'FlutterError',
          message: msg,
          stackTrace: details.stack?.toString(),
        ),
      );
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(
        report(
          crashType: 'UncaughtError',
          message: error.toString(),
          stackTrace: stack.toString(),
        ),
      );
      return true;
    };

    unawaited(_flushDiskPending());
    unawaited(flushPending());
  }

  static bool _isIgnorable(String message) {
    return message.contains('ListTile background color or ink splashes may be invisible');
  }

  static Future<bool> reportManual({
    required String message,
    String? screenName,
    Map<String, dynamic>? metadata,
  }) {
    return report(
      crashType: 'ManualReport',
      message: message,
      screenName: screenName,
      metadata: {...?metadata, 'feedback': true},
    );
  }

  static void trackNetworkError(Object error, {String? url, int? statusCode}) {
    final friendly = friendlyNetworkMessage(error, action: 'contacter Cloudity');
    unawaited(
      report(
        crashType: 'NetworkError',
        message: friendly,
        metadata: {
          if (url != null) 'url': url,
          if (statusCode != null) 'statusCode': statusCode,
          'raw': error.toString().length > 400
              ? error.toString().substring(0, 400)
              : error.toString(),
        },
      ),
    );
  }

  static Future<bool> report({
    required String crashType,
    required String message,
    String? stackTrace,
    String? screenName,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final payload = {
        'crashType': crashType,
        'product': _product?.name ?? 'unknown',
        'message': message.length > 2000 ? message.substring(0, 2000) : message,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        if (stackTrace != null)
          'stackTrace': stackTrace.length > 4000
              ? stackTrace.substring(0, 4000)
              : stackTrace,
        'screenName': screenName ?? 'unknown',
        'userEmail': _userEmail,
        'deviceInfo': {
          'platform': Platform.operatingSystem,
          'osVersion': Platform.operatingSystemVersion,
          'locale': Platform.localeName,
        },
        'metadata': metadata ?? {},
      };
      final sent = await _send(payload);
      if (!sent) {
        _pending.add(payload);
        await _persist(payload);
      }
      return sent;
    } catch (e) {
      debugPrint('[CloudityCrashReporter] report failed: $e');
      return false;
    }
  }

  static Future<void> flushPending() async {
    if (_pending.isEmpty) return;
    final copy = List<Map<String, dynamic>>.from(_pending);
    _pending.clear();
    for (final item in copy) {
      final ok = await _send(item);
      if (!ok) {
        _pending.add(item);
        break;
      }
    }
  }

  static Future<bool> _send(Map<String, dynamic> payload) async {
    final base = await _resolveGateway();
    if (base == null) return false;
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (_authToken != null && _authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    try {
      final res = await http
          .post(
            Uri.parse('$base/mobile/crashes'),
            headers: headers,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 12));
      return res.statusCode == 200 || res.statusCode == 201;
    } catch (e) {
      debugPrint('[CloudityCrashReporter] send: $e');
      return false;
    }
  }

  static Future<String?> _resolveGateway() async {
    if (_gatewayBase != null && _gatewayBase!.isNotEmpty) return _gatewayBase;
    final candidates = SuiteGatewayConfig.candidates();
    if (candidates.isNotEmpty) {
      _gatewayBase = candidates.first;
      return _gatewayBase;
    }
    return null;
  }

  static Future<void> _persist(Map<String, dynamic> report) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_pendingFile');
      await file.writeAsString('${jsonEncode(report)}\n', mode: FileMode.append);
    } catch (_) {}
  }

  static Future<void> _flushDiskPending() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_pendingFile');
      if (!await file.exists()) return;
      final lines = await file.readAsLines();
      for (final line in lines) {
        final t = line.trim();
        if (t.isEmpty) continue;
        try {
          final map = Map<String, dynamic>.from(jsonDecode(t) as Map);
          final ok = await _send(map);
          if (!ok) _pending.add(map);
        } catch (_) {}
      }
      await file.writeAsString('');
    } catch (_) {}
  }
}
