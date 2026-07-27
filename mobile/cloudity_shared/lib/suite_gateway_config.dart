import 'suite_defaults.dart';

/// Résolution de l’URL gateway pour les apps Flutter (dart-define + fallbacks dev).
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

  /// Candidats à tester au login (USB, émulateur, LAN).
  static List<String> candidates({String? savedGateway}) {
    final candidates = <String>[
      if (hasDartDefine) fromDartDefine,
      ClouditySuiteDefaults.defaultGatewayUsb,
      if (savedGateway != null && savedGateway.trim().isNotEmpty) savedGateway.trim(),
      ClouditySuiteDefaults.defaultGatewayEmulator,
      'http://10.0.3.2:6002',
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
