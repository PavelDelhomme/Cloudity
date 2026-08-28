import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

/// Manifeste OTA renvoyé par `GET /deploy/mobile/manifest?app=…`.
class CloudityOtaManifest {
  const CloudityOtaManifest({
    required this.app,
    required this.version,
    required this.minSupported,
    required this.apkUrl,
    required this.sha256,
    required this.publishedAt,
  });

  final String app;
  final String version;
  final String minSupported;
  final String apkUrl;
  final String sha256;
  final String publishedAt;

  factory CloudityOtaManifest.fromJson(Map<String, dynamic> json) {
    return CloudityOtaManifest(
      app: (json['app'] as String? ?? '').trim(),
      version: (json['version'] as String? ?? '').trim(),
      minSupported: (json['min_supported'] as String? ?? '').trim(),
      apkUrl: (json['apk_url'] as String? ?? '').trim(),
      sha256: (json['sha256'] as String? ?? '').trim(),
      publishedAt: (json['published_at'] as String? ?? '').trim(),
    );
  }
}

/// Compare versions semver simples `1.2.3` (ignore suffixes `+build`).
int cloudityCompareVersions(String a, String b) {
  List<int> parts(String v) {
    final core = v.split(RegExp(r'[-+]')).first;
    return core
        .split('.')
        .map((p) => int.tryParse(p) ?? 0)
        .toList(growable: false);
  }

  final pa = parts(a);
  final pb = parts(b);
  final n = pa.length > pb.length ? pa.length : pb.length;
  for (var i = 0; i < n; i++) {
    final x = i < pa.length ? pa[i] : 0;
    final y = i < pb.length ? pb[i] : 0;
    if (x != y) return x.compareTo(y);
  }
  return 0;
}

/// Client OTA : local / LAN / prod = même chemin HTTPS (ou HTTP en dev) sur la gateway.
abstract final class CloudityOtaClient {
  static Future<CloudityOtaManifest?> fetchManifest({
    required String gatewayBase,
    required String appSlug,
    http.Client? client,
  }) async {
    final base = gatewayBase.replaceAll(RegExp(r'/$'), '');
    if (base.isEmpty || appSlug.trim().isEmpty) return null;
    final uri = Uri.parse('$base/deploy/mobile/manifest').replace(
      queryParameters: {'app': appSlug.trim()},
    );
    final c = client ?? http.Client();
    try {
      final res = await c.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final map = jsonDecode(res.body);
      if (map is! Map<String, dynamic>) return null;
      return CloudityOtaManifest.fromJson(map);
    } catch (_) {
      return null;
    } finally {
      if (client == null) c.close();
    }
  }

  /// Retourne le manifeste si une version plus récente que [currentVersion] est publiée.
  static Future<CloudityOtaManifest?> checkUpdate({
    required String gatewayBase,
    required String appSlug,
    required String currentVersion,
    http.Client? client,
  }) async {
    final m = await fetchManifest(
      gatewayBase: gatewayBase,
      appSlug: appSlug,
      client: client,
    );
    if (m == null || m.version.isEmpty || m.apkUrl.isEmpty) return null;
    if (cloudityCompareVersions(m.version, currentVersion) <= 0) return null;
    return m;
  }
}

/// Dialogue « mise à jour disponible » — ouvre l’URL APK HTTPS sécurisée.
Future<void> cloudityShowOtaDialog(
  BuildContext context, {
  required CloudityOtaManifest manifest,
  required String currentVersion,
}) async {
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Mise à jour disponible'),
      content: Text(
        'Version ${manifest.version} (installée : $currentVersion).\n'
        'Téléchargement sécurisé depuis l’API Cloudity.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Plus tard'),
        ),
        FilledButton(
          onPressed: () async {
            final uri = Uri.tryParse(manifest.apkUrl);
            if (uri != null) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            }
            if (ctx.mounted) Navigator.of(ctx).pop();
          },
          child: const Text('Télécharger'),
        ),
      ],
    ),
  );
}

/// Lance un check OTA en arrière-plan après le 1er frame (best-effort, silencieux si KO).
void cloudityScheduleOtaCheck(
  BuildContext context, {
  required String gatewayBase,
  required String appSlug,
  String? currentVersion,
}) {
  final version = (currentVersion ??
          const String.fromEnvironment('CLOUDITY_APP_VERSION', defaultValue: '0.0.0'))
      .trim();
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    final m = await CloudityOtaClient.checkUpdate(
      gatewayBase: gatewayBase,
      appSlug: appSlug,
      currentVersion: version.isEmpty ? '0.0.0' : version,
    );
    if (m == null || !context.mounted) return;
    await cloudityShowOtaDialog(
      context,
      manifest: m,
      currentVersion: version.isEmpty ? '0.0.0' : version,
    );
  });
}
