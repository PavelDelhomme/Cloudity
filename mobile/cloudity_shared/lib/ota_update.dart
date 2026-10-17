import 'dart:convert';
import 'dart:io';

import 'package:hubera_ota_installer/hubera_ota_installer.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
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
      apkUrl: (json['apk_url'] as String? ?? json['apk'] as String? ?? '').trim(),
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

  /// `https://<hôte>/updates.json` avec la version installée, pour que l’API
  /// puisse répondre `apkAvailable: false` quand le téléphone est déjà à jour.
  static Future<Uri> _updatesUri(String host) async {
    final uri = Uri.parse('https://$host/updates.json');
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final code = info.buildNumber.trim();
      final pkg = info.packageName.trim();
      return uri.replace(
        queryParameters: {
          if (version.isNotEmpty) 'clientVersion': version,
          if (code.isNotEmpty) 'clientVersionCode': code,
          if (pkg.isNotEmpty) 'clientPackage': pkg,
        },
      );
    } catch (_) {
      return uri;
    }
  }

  /// Feed Maps-like : `https://notes.hubera.cloud/updates.json`.
  static Future<CloudityOtaManifest?> fetchHuberaUpdates({
    required String host,
    http.Client? client,
  }) async {
    final h = host.trim().replaceAll(RegExp(r'^https?://'), '').replaceAll(RegExp(r'/$'), '');
    if (h.isEmpty) return null;
    final uri = await _updatesUri(h);
    final c = client ?? http.Client();
    try {
      final res = await c.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final map = jsonDecode(res.body);
      if (map is! Map<String, dynamic>) return null;
      final mapped = Map<String, dynamic>.from(map);
      try {
        final info = await PackageInfo.fromPlatform();
        final installed = info.packageName.trim();
        final feedPkg = (mapped['package'] as String? ?? '').trim();
        final canon = mapped['canonical'];
        if (canon is Map &&
            installed.isNotEmpty &&
            (canon['package'] as String? ?? '').trim() == installed) {
          final cv = (canon['version'] as String? ?? '').trim();
          final capk = (canon['apk_url'] as String? ?? canon['apk'] as String? ?? '').trim();
          if (cv.isNotEmpty && capk.isNotEmpty) {
            mapped['version'] = cv;
            mapped['apk_url'] = capk;
            mapped['apk'] = capk;
            mapped['package'] = installed;
            mapped['sha256'] = (canon['sha256'] as String? ?? mapped['sha256'] as String? ?? '').trim();
            mapped['versionCode'] = canon['versionCode'] ?? mapped['versionCode'];
          }
        } else if (feedPkg.isNotEmpty && installed.isNotEmpty && feedPkg != installed) {
          return null;
        }
      } catch (_) {
        /* package_info indisponible : on garde le manifeste brut */
      }
      final version = (mapped['version'] as String? ?? '').trim();
      final apk = (mapped['apk_url'] as String? ?? mapped['apk'] as String? ?? '').trim();
      if (version.isEmpty || apk.isEmpty) return null;
      final apkPath = Uri.tryParse(apk)?.path.toLowerCase() ?? apk.toLowerCase();
      if (apkPath.endsWith('/install') ||
          apkPath.endsWith('.html') ||
          apkPath.endsWith('.htm')) {
        return null;
      }
      return CloudityOtaManifest.fromJson({
        ...mapped,
        'apk_url': apk,
        'min_supported': (mapped['min_supported'] as String? ?? version).trim(),
        'published_at': (mapped['published_at'] as String? ?? mapped['generated'] as String? ?? '').trim(),
        'hubera': {
          'message': (mapped['notes'] as String? ?? '').trim(),
        },
      });
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

  /// Préfère le feed produit Hubera, sinon le manifeste gateway Cloudity.
  static Future<CloudityOtaManifest?> checkHuberaOrGateway({
    required String gatewayBase,
    required String appSlug,
    required String currentVersion,
    String? huberaHost,
    http.Client? client,
  }) async {
    if (huberaHost != null && huberaHost.trim().isNotEmpty) {
      final hosted = await fetchHuberaUpdates(host: huberaHost, client: client);
      if (hosted != null) {
        if (hosted.apkUrl.isNotEmpty &&
            cloudityCompareVersions(hosted.version, currentVersion) > 0) {
          return hosted;
        }
        // Feed produit joignable : ne pas retomber sur un APK gateway obsolète / hash faux.
        return null;
      }
    }
    return checkUpdate(
      gatewayBase: gatewayBase,
      appSlug: appSlug,
      currentVersion: currentVersion,
      client: client,
    );
  }

  /// Feed produit d’abord. Si le host répond, on ne propose pas un APK gateway plus vieux.
  static Future<CloudityManualUpdateProbe> probeManual({
    required String gatewayBase,
    required String appSlug,
    String? huberaHost,
  }) async {
    final installedVersion = await cloudityResolveInstalledVersion();
    var localCode = 0;
    var packageName = '';
    try {
      final info = await PackageInfo.fromPlatform();
      localCode = int.tryParse(info.buildNumber) ?? 0;
      packageName = info.packageName.trim();
    } catch (_) {}

    final host = huberaHost?.trim() ?? '';
    if (host.isNotEmpty) {
      final clean = host.replaceAll(RegExp(r'^https?://'), '').replaceAll(RegExp(r'/$'), '');
      final got = await _fetchJsonMap(await _updatesUri(clean));
      if (got.reachable) {
        final feed = got.json;
        if (feed == null) {
          return CloudityManualUpdateProbe(
            reachable: true,
            installedVersion: installedVersion,
          );
        }
        final slot = _pickFeedSlot(feed, packageName);
        if (slot == null) {
          return CloudityManualUpdateProbe(
            reachable: true,
            installedVersion: installedVersion,
          );
        }
        return CloudityManualUpdateProbe(
          reachable: true,
          installedVersion: installedVersion,
          remoteVersion: (slot['version']?.toString() ?? '').trim(),
          offer: _offerIfNewer(slot, installedVersion, localCode, appSlug),
        );
      }
    }

    final manifest = await fetchManifest(
      gatewayBase: gatewayBase,
      appSlug: appSlug,
      currentVersion: installedVersion,
    );
    if (manifest == null) {
      return CloudityManualUpdateProbe(
        reachable: false,
        installedVersion: installedVersion,
      );
    }
    final newer = manifest.apkUrl.isNotEmpty &&
        cloudityCompareVersions(manifest.version, installedVersion) > 0;
    return CloudityManualUpdateProbe(
      reachable: true,
      installedVersion: installedVersion,
      remoteVersion: manifest.version,
      offer: newer ? manifest : null,
    );
  }

  static Future<({bool reachable, Map<String, dynamic>? json})> _fetchJsonMap(Uri uri) async {
    final c = http.Client();
    try {
      final res = await c.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return (reachable: false, json: null);
      final map = jsonDecode(res.body);
      if (map is! Map) return (reachable: true, json: null);
      return (reachable: true, json: Map<String, dynamic>.from(map));
    } catch (_) {
      return (reachable: false, json: null);
    } finally {
      c.close();
    }
  }

  static Map<String, dynamic>? _pickFeedSlot(Map<String, dynamic> feed, String installed) {
    final canon = feed['canonical'];
    if (canon is Map &&
        installed.isNotEmpty &&
        (canon['package']?.toString() ?? '').trim() == installed) {
      return {
        'version': canon['version'],
        'versionCode': canon['versionCode'] ?? feed['versionCode'],
        'apk_url': canon['apk_url'] ?? canon['apk'],
        'sha256': canon['sha256'] ?? feed['sha256'],
        'notes': feed['notes'],
        'apkAvailable': feed['apkAvailable'],
        'app': feed['app'] ?? feed['slug'] ?? 'calendar',
        'published_at': feed['published_at'] ?? feed['generated'],
        'min_supported': feed['min_supported'],
      };
    }
    final pkg = (feed['package']?.toString() ?? '').trim();
    if (installed.isNotEmpty && pkg.isNotEmpty && pkg != installed) return null;
    return feed;
  }

  static CloudityOtaManifest? _offerIfNewer(
    Map<String, dynamic> slot,
    String localVersion,
    int localCode,
    String appSlug,
  ) {
    if (slot['apkAvailable'] == false) return null;
    final version = (slot['version']?.toString() ?? '').trim();
    final apk = (slot['apk_url'] ?? slot['apk'] ?? '').toString().trim();
    if (version.isEmpty || apk.isEmpty) return null;
    final path = Uri.tryParse(apk)?.path.toLowerCase() ?? apk.toLowerCase();
    if (path.endsWith('/install') || path.endsWith('.html') || path.endsWith('.htm')) {
      return null;
    }
    final nameCmp = cloudityCompareVersions(version, localVersion);
    if (nameCmp < 0) return null;
    final remoteCode = _jsonInt(slot['versionCode']);
    if (remoteCode != null && localCode > 0 && remoteCode <= localCode) return null;
    final newer = nameCmp > 0 || (remoteCode != null && localCode > 0 && remoteCode > localCode);
    if (!newer) return null;
    return CloudityOtaManifest.fromJson({
      'app': (slot['app'] ?? appSlug).toString(),
      'version': version,
      'min_supported': (slot['min_supported'] ?? version).toString(),
      'apk_url': apk,
      'sha256': (slot['sha256'] ?? '').toString(),
      'published_at': (slot['published_at'] ?? '').toString(),
      'hubera': {'message': (slot['notes'] ?? '').toString()},
    });
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

/// Taille cohérente avec un APK réel — 64 Kio de marge (headers / FS).
bool cloudityShouldReuseOtaFile({
  required bool exists,
  int? actualSize,
  int? expectedSize,
}) {
  if (!exists || actualSize == null || actualSize < 100 * 1024) return false;
  if (expectedSize == null || expectedSize <= 0) {
    return actualSize >= 5 * 1024 * 1024;
  }
  return (actualSize - expectedSize).abs() <= 64 * 1024;
}

Future<bool> _apkZipMagic(File file) async {
  try {
    if (!await file.exists()) return false;
    final raf = await file.open();
    try {
      final magic = await raf.read(4);
      return magic.length >= 2 && magic[0] == 0x50 && magic[1] == 0x4b;
    } finally {
      await raf.close();
    }
  } catch (_) {
    return false;
  }
}

/// Ne plus vider le cache au check OTA : un DL commencé doit survivre au kill.
Future<void> cloudityPurgeOtaCache() async {
  // Conservé pour les appels historiques ; no-op volontaire (A7 reprise DL).
}

Future<void> _safeDelete(File? file) async {
  if (file == null) return;
  try {
    if (await file.exists()) await file.delete();
  } catch (_) {}
}

Future<File> _otaPendingMarker() async {
  final dir = await _otaCacheDir();
  return File('${dir.path}/pending-install.path');
}

Future<void> _rememberPendingInstall(File apk) async {
  final marker = await _otaPendingMarker();
  await marker.writeAsString(apk.absolute.path);
}

/// Au retour de l’écran système : installe l’APK déjà téléchargée, sans nouveau GET.
Future<void> cloudityResumePendingOtaInstall() async {
  if (!Platform.isAndroid) return;
  if (!await HuberaOtaInstaller.canInstallPackages()) return;
  final marker = await _otaPendingMarker();
  if (!await marker.exists()) return;
  final path = (await marker.readAsString()).trim();
  final file = File(path);
  if (!await file.exists() || !await _apkZipMagic(file)) return;
  await marker.delete();
  await HuberaOtaInstaller.installApk(file);
}

Future<void> _installOrAskPermission(File dest) async {
  if (!await HuberaOtaInstaller.canInstallPackages()) {
    await _rememberPendingInstall(dest);
    await HuberaOtaInstaller.openInstallPermissionSettings();
    throw StateError(
      'Le fichier est déjà téléchargé. Autorise l’installation : au retour, Hubera l’installe sans retélécharger.',
    );
  }
  final marker = await _otaPendingMarker();
  if (await marker.exists()) await marker.delete();
  await HuberaOtaInstaller.installApk(dest);
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

  final dir = await _otaCacheDir();
  final safeName = manifest.app.isEmpty
      ? 'update'
      : manifest.app.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
  final dest = File('${dir.path}/$safeName-${manifest.version}.apk');
  final expectedSha = manifest.sha256.trim().toLowerCase();

  Future<bool> fileReady() async {
    if (!await dest.exists()) return false;
    final size = await dest.length();
    if (!cloudityShouldReuseOtaFile(exists: true, actualSize: size)) {
      return false;
    }
    if (!await _apkZipMagic(dest)) return false;
    if (expectedSha.isEmpty) return true;
    final actual =
        (await sha256.bind(dest.openRead()).first).toString().toLowerCase();
    return actual == expectedSha;
  }

  if (await fileReady()) {
    onProgress?.call(1.0);
    await _installOrAskPermission(dest);
    return;
  }

  final c = client ?? http.Client();
  try {
    final uri = Uri.parse(manifest.apkUrl);
    var offset = 0;
    if (await dest.exists()) {
      offset = await dest.length();
      if (offset > 0 && offset < 100 * 1024) {
        await _safeDelete(dest);
        offset = 0;
      }
    }

    final req = http.Request('GET', uri);
    if (offset > 0) {
      req.headers['Range'] = 'bytes=$offset-';
    }
    final res = await c.send(req).timeout(const Duration(minutes: 10));
    if (res.statusCode == 200 && offset > 0) {
      await _safeDelete(dest);
      offset = 0;
    } else if (res.statusCode != 200 && res.statusCode != 206) {
      throw HttpException(
        'Téléchargement APK HTTP ${res.statusCode}',
        uri: uri,
      );
    }

    final totalHeader = res.contentLength ?? 0;
    final total = res.statusCode == 206 ? offset + totalHeader : totalHeader;
    final sink = dest.openWrite(mode: FileMode.append);
    var received = offset;

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
      // Garde le partiel pour reprise après kill — ne pas delete.
      rethrow;
    }

    onProgress?.call(1.0);

    final size = await dest.length();
    if (size < 100 * 1024) {
      await _safeDelete(dest);
      throw StateError('APK trop petite ($size octets) — fichier invalide.');
    }
    if (!await _apkZipMagic(dest)) {
      await _safeDelete(dest);
      throw StateError(
        'Fichier téléchargé n’est pas une APK (page HTML / réseau).',
      );
    }

    if (expectedSha.isNotEmpty) {
      final actual =
          (await sha256.bind(dest.openRead()).first).toString().toLowerCase();
      if (actual != expectedSha) {
        await _safeDelete(dest);
        throw StateError(
          'Contrôle d’intégrité échoué (SHA-256). Mise à jour annulée.',
        );
      }
    }

    await _installOrAskPermission(dest);
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
    final notes = (m.huberaMessage ?? '').trim();
    return AlertDialog(
      title: Text(
        _busy
            ? (_phase.isEmpty ? 'Téléchargement…' : _phase)
            : 'Mise à jour disponible',
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            notes.isNotEmpty
                ? notes
                : 'Version ${m.version} (installée : ${widget.currentVersion}). '
                    'La mise à jour n’est pas obligatoire.',
          ),
          if (_busy) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: LinearProgressIndicator(
                    value: (_progress != null && _progress! > 0)
                        ? _progress
                        : null,
                  ),
                ),
              ],
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
          child: Text(_error == null ? 'Télécharger' : 'Réessayer'),
        ),
      ],
    );
  }
}

/// Version installée : dart-define, sinon `package_info` (évite un faux 0.0.0
/// qui déclenchait le dialogue OTA alors que l’APK est déjà 1.0.0).
Future<String> cloudityResolveInstalledVersion({String? currentVersion}) async {
  var version = (currentVersion ??
          const String.fromEnvironment('CLOUDITY_APP_VERSION', defaultValue: ''))
      .trim();
  if (version.isEmpty || version == '0.0.0') {
    try {
      final info = await PackageInfo.fromPlatform();
      final fromPkg = info.version.trim();
      if (fromPkg.isNotEmpty) version = fromPkg;
    } catch (_) {}
  }
  return version.isEmpty ? '0.0.0' : version;
}

class CloudityManualUpdateProbe {
  const CloudityManualUpdateProbe({
    required this.reachable,
    required this.installedVersion,
    this.remoteVersion = '',
    this.offer,
  });

  final bool reachable;
  final String installedVersion;
  final String remoteVersion;

  /// Non nul seulement si une APK plus récente est proposée. Jamais une plus vieille.
  final CloudityOtaManifest? offer;
}

int? _jsonInt(dynamic raw) {
  if (raw is int) return raw;
  if (raw is num) return raw.toInt();
  return int.tryParse(raw?.toString() ?? '');
}

/// Recherche manuelle. La détection automatique ([cloudityScheduleOtaCheck]) ne change pas.
/// Une mise à jour trouvée s’affiche avec « Plus tard » : jamais forcée.
Future<void> cloudityCheckUpdateManually(
  BuildContext context, {
  required String gatewayBase,
  required String appSlug,
  required String appName,
  String? huberaHost,
}) async {
  if (!context.mounted) return;
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => const AlertDialog(
      title: Text('Vérification…'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LinearProgressIndicator(),
          SizedBox(height: 16),
          Text(
            'On vérifie s’il y a une mise à jour. Elle reste proposée, jamais forcée.',
          ),
        ],
      ),
    ),
  );
  final probe = await CloudityOtaClient.probeManual(
    gatewayBase: gatewayBase,
    appSlug: appSlug,
    huberaHost: huberaHost,
  );
  if (!context.mounted) return;
  Navigator.of(context, rootNavigator: true).pop();
  if (!probe.reachable) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Vérification impossible. Le serveur de mise à jour ne répond pas.',
        ),
      ),
    );
    return;
  }
  final offer = probe.offer;
  if (offer == null) {
    final remote = probe.remoteVersion.trim();
    final extra = remote.isEmpty ? '' : ' · serveur v$remote';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Rien de plus récent. $appName v${probe.installedVersion} est à jour$extra.',
        ),
      ),
    );
    return;
  }
  await cloudityShowOtaDialog(
    context,
    manifest: offer,
    currentVersion: probe.installedVersion,
  );
}

/// Lance un check OTA en arrière-plan après le 1er frame (best-effort, silencieux si KO).
void cloudityScheduleOtaCheck(
  BuildContext context, {
  required String gatewayBase,
  required String appSlug,
  String? currentVersion,
  String? huberaHost,
}) {
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    // Ne pas coller le dialogue OTA sur le splash / 1er paint (Mail trop lent).
    await Future<void>.delayed(const Duration(seconds: 20));
    if (!context.mounted) return;
    final version = await cloudityResolveInstalledVersion(
      currentVersion: currentVersion,
    );
    final m = await CloudityOtaClient.checkHuberaOrGateway(
      gatewayBase: gatewayBase,
      appSlug: appSlug,
      currentVersion: version,
      huberaHost: huberaHost,
    );
    if (m == null || !context.mounted) return;
    await cloudityShowOtaDialog(
      context,
      manifest: m,
      currentVersion: version,
    );
  });
}
