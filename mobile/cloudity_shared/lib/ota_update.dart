import 'dart:convert';
import 'dart:io';

import 'package:cloudity_ota_installer/cloudity_ota_installer.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Manifeste OTA renvoyé par `GET /deploy/mobile/manifest?app=…`.
class CloudityOtaManifest {
  const CloudityOtaManifest({
    required this.app,
    required this.version,
    required this.minSupported,
    required this.apkUrl,
    required this.sha256,
    required this.publishedAt,
    this.huberaMessage,
  });

  final String app;
  final String version;
  final String minSupported;
  final String apkUrl;
  final String sha256;
  final String publishedAt;
  final String? huberaMessage;

  factory CloudityOtaManifest.fromJson(Map<String, dynamic> json) {
    final hubera = json['hubera'];
    String? message;
    if (hubera is Map) {
      message = (hubera['message'] as String?)?.trim();
    }
    return CloudityOtaManifest(
      app: (json['app'] as String? ?? '').trim(),
      version: (json['version'] as String? ?? '').trim(),
      minSupported: (json['min_supported'] as String? ?? '').trim(),
      apkUrl: (json['apk_url'] as String? ?? '').trim(),
      sha256: (json['sha256'] as String? ?? '').trim(),
      publishedAt: (json['published_at'] as String? ?? '').trim(),
      huberaMessage: message,
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
    String? currentVersion,
    http.Client? client,
  }) async {
    final base = gatewayBase.replaceAll(RegExp(r'/$'), '');
    if (base.isEmpty || appSlug.trim().isEmpty) return null;
    final install = await _huberaInstallId();
    final uri = Uri.parse('$base/deploy/mobile/manifest').replace(
      queryParameters: {
        'app': appSlug.trim(),
        if (currentVersion != null && currentVersion.isNotEmpty)
          'clientVersion': currentVersion,
        'install': install,
        'huberaAware': '1',
      },
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
      currentVersion: currentVersion,
      client: client,
    );
    if (m == null || m.version.isEmpty || m.apkUrl.isEmpty) return null;
    if (cloudityCompareVersions(m.version, currentVersion) <= 0) return null;
    return m;
  }
}

Future<String> _huberaInstallId() async {
  try {
    final dir = await getApplicationSupportDirectory();
    final file = File('${dir.path}/hubera_install_id');
    if (await file.exists()) {
      final id = (await file.readAsString()).trim();
      if (id.isNotEmpty) return id;
    }
    final id =
        'c-${DateTime.now().microsecondsSinceEpoch}-${file.hashCode.abs()}';
    await file.writeAsString(id);
    return id;
  } catch (_) {
    return 'c-anon';
  }
}

Future<Directory> _otaCacheDir() async {
  final base = await getTemporaryDirectory();
  final dir = Directory('${base.path}/ota');
  if (!await dir.exists()) {
    await dir.create(recursive: true);
  }
  return dir;
}

/// Supprime tous les APK OTA restants dans le cache app (jamais Téléchargements).
Future<void> cloudityPurgeOtaCache() async {
  try {
    final dir = await _otaCacheDir();
    if (!await dir.exists()) return;
    await for (final entity in dir.list()) {
      if (entity is File) {
        try {
          await entity.delete();
        } catch (_) {}
      }
    }
  } catch (_) {}
}

Future<void> _safeDelete(File? file) async {
  if (file == null) return;
  try {
    if (await file.exists()) await file.delete();
  } catch (_) {}
}

/// Télécharge l’APK dans le cache app, vérifie le SHA-256, lance l’installeur système.
Future<void> cloudityDownloadAndInstallOta(
  CloudityOtaManifest manifest, {
  void Function(double progress)? onProgress,
  http.Client? client,
}) async {
  if (!Platform.isAndroid) {
    throw UnsupportedError('Mise à jour in-app disponible sur Android uniquement.');
  }

  await cloudityPurgeOtaCache();
  final dir = await _otaCacheDir();
  final safeName = manifest.app.isEmpty
      ? 'update'
      : manifest.app.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
  final dest = File('${dir.path}/$safeName-${manifest.version}.apk');
  if (await dest.exists()) {
    await dest.delete();
  }

  final c = client ?? http.Client();
  try {
    final uri = Uri.parse(manifest.apkUrl);
    final req = http.Request('GET', uri);
    final res = await c.send(req).timeout(const Duration(minutes: 10));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw HttpException(
        'Téléchargement APK HTTP ${res.statusCode}',
        uri: uri,
      );
    }

    final total = res.contentLength ?? 0;
    final sink = dest.openWrite();
    var received = 0;

    try {
      await for (final chunk in res.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) {
          onProgress?.call((received / total).clamp(0.0, 1.0));
        } else {
          onProgress?.call(0.0);
        }
      }
      await sink.flush();
      await sink.close();
    } catch (e) {
      try {
        await sink.close();
      } catch (_) {}
      await _safeDelete(dest);
      rethrow;
    }

    onProgress?.call(1.0);

    final expected = manifest.sha256.trim().toLowerCase();
    if (expected.isNotEmpty) {
      final actual = (await sha256.bind(dest.openRead()).first).toString().toLowerCase();
      if (actual != expected) {
        await _safeDelete(dest);
        throw StateError(
          'Contrôle d’intégrité échoué (SHA-256). Mise à jour annulée.',
        );
      }
    }

    if (!await CloudityOtaInstaller.canInstallPackages()) {
      await CloudityOtaInstaller.openInstallPermissionSettings();
      throw StateError(
        'Autorise l’installation d’apps pour Cloudity, puis réessaie la mise à jour.',
      );
    }

    try {
      await CloudityOtaInstaller.installApk(dest);
    } catch (e) {
      await _safeDelete(dest);
      rethrow;
    }

    // L’installeur système a une copie via FileProvider / session — on nettoie le cache.
    // Petit délai pour laisser le temps au PackageInstaller d’ouvrir le fichier.
    Future<void>.delayed(const Duration(seconds: 45), () => _safeDelete(dest));
  } finally {
    if (client == null) c.close();
  }
}

/// Dialogue « mise à jour disponible » — téléchargement + install **in-app** (pas de navigateur).
Future<void> cloudityShowOtaDialog(
  BuildContext context, {
  required CloudityOtaManifest manifest,
  required String currentVersion,
}) async {
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _OtaUpdateDialog(
      manifest: manifest,
      currentVersion: currentVersion,
    ),
  );
}

class _OtaUpdateDialog extends StatefulWidget {
  const _OtaUpdateDialog({
    required this.manifest,
    required this.currentVersion,
  });

  final CloudityOtaManifest manifest;
  final String currentVersion;

  @override
  State<_OtaUpdateDialog> createState() => _OtaUpdateDialogState();
}

class _OtaUpdateDialogState extends State<_OtaUpdateDialog> {
  bool _busy = false;
  double? _progress;
  String? _error;
  String _phase = '';

  Future<void> _start() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _progress = 0;
      _phase = 'Téléchargement…';
    });
    try {
      await cloudityDownloadAndInstallOta(
        widget.manifest,
        onProgress: (p) {
          if (!mounted) return;
          setState(() {
            _progress = p;
            _phase = p >= 1.0 ? 'Installation…' : 'Téléchargement…';
          });
        },
      );
      if (!mounted) return;
      setState(() {
        _phase = 'Installeur système ouvert';
        _busy = false;
        _progress = 1.0;
      });
      // Ferme le dialogue : l’UI Android d’install prend le relais.
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _progress = null;
        _phase = '';
        _error = e is StateError || e is HttpException || e is UnsupportedError
            ? e.toString().replaceFirst(RegExp(r'^[^:]+:\s*'), '')
            : 'Mise à jour impossible. Réessaie.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.manifest;
    return AlertDialog(
      title: const Text('Mise à jour disponible'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Version ${m.version} (installée : ${widget.currentVersion}).\n'
            'La mise à jour se fait dans l’application — aucun navigateur.',
          ),
          if ((m.huberaMessage ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(m.huberaMessage!, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (_busy) ...[
            const SizedBox(height: 16),
            Text(_phase, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: (_progress != null && _progress! > 0) ? _progress : null,
            ),
            if (_progress != null && _progress! > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${(_progress! * 100).clamp(0, 100).toStringAsFixed(0)} %',
                  textAlign: TextAlign.end,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Plus tard'),
        ),
        FilledButton(
          onPressed: _busy ? null : _start,
          child: Text(_error == null ? 'Mettre à jour' : 'Réessayer'),
        ),
      ],
    );
  }
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
    await cloudityPurgeOtaCache();
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
