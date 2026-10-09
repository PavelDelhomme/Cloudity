import 'package:flutter/foundation.dart';

import 'suite_defaults.dart';

/// Résolution de l’URL gateway pour les apps Flutter (dart-define + fallbacks).
abstract final class SuiteGatewayConfig {
  static const String _buildGateway = String.fromEnvironment(
    'CLOUDITY_GATEWAY_URL',
    defaultValue: '',
  );
  static const String _e2eGateway = String.fromEnvironment(
    'CLOUDITY_E2E_GATEWAY',
    defaultValue: '',
  );

  static String get fromDartDefine {
    final configured = _buildGateway.trim();
    if (configured.isNotEmpty) return configured;
    return _e2eGateway.trim();
  }

  static bool get hasDartDefine => fromDartDefine.isNotEmpty;

  /// Release = Hubera ID (vraie app iPhone/Android). Debug = USB / émulateur.
  static String get runtimeDefault => hasDartDefine
      ? fromDartDefine
      : (kReleaseMode
          ? ClouditySuiteDefaults.defaultGatewayProduction
          : ClouditySuiteDefaults.defaultGatewayUsb);

  /// Candidats à tester au login.
  static List<String> candidates({String? savedGateway}) {
    final candidates = <String>[
      if (savedGateway != null && savedGateway.trim().isNotEmpty) savedGateway.trim(),
      if (hasDartDefine) fromDartDefine,
      if (kReleaseMode) ClouditySuiteDefaults.defaultGatewayProduction,
      if (kDebugMode) ClouditySuiteDefaults.defaultGatewayUsb,
      if (kDebugMode) ClouditySuiteDefaults.defaultGatewayEmulator,
      if (kDebugMode) 'http://10.0.3.2:6002',
    ];
    final seen = <String>{};
    final uniq = <String>[];
    for (final c in candidates) {
      final normalized = c.replaceAll(RegExp(r'/$'), '');
      if (normalized.isEmpty) continue;
      if (seen.add(normalized)) uniq.add(normalized);
    }
    return uniq;
  }
}
