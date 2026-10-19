import 'dart:convert';
import 'dart:io';

import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:http/http.dart' as http;
import 'package:hubera_ota_installer/hubera_ota_installer.dart';
import 'package:path_provider/path_provider.dart';

import 'hubera_id_launch.dart';

/// Télécharge l’APK officielle seulement après un geste. N’efface aucune session.
Future<String> offerOfficialHuberaIdApk({
  required bool userAccepted,
  http.Client? client,
  bool? android,
  bool? idInstalled,
}) async {
  final onAndroid = android ?? Platform.isAndroid;
  final installedCode = onAndroid && idInstalled == null
      ? await CloudityAuthBroker.huberaIdVersionCode()
      : null;
  final installed = idInstalled ?? ((installedCode ?? -1) >= 0);
  final plan = planHuberaIdLaunch(
    android: onAndroid,
    idInstalled: installed,
    installedVersionCode: installedCode != null && installedCode >= 0 ? installedCode : null,
    minimumSessionCode: huberaIdSessionMinimumCode,
  );
  if (plan.clearSessionOnUpdate || plan.silentInstall) {
    return 'Refusé.';
  }
  if (plan.action == HuberaIdLaunch.noIosBinary) {
    return 'Pas de binaire iOS.';
  }
  if (plan.action == HuberaIdLaunch.resume) {
    return 'Hubera ID est déjà là. La session reste.';
  }
  if (!userAccepted) {
    return 'Installation non demandée.';
  }
  final ownClient = client == null;
  final httpClient = client ?? http.Client();
  try {
    final feedUri = Uri.parse(
      'https://id.hubera.cloud/api/version?clientVersion=0&clientVersionCode=0&clientPackage=cloud.hubera.id',
    );
    final response = await httpClient.get(feedUri, headers: {'Accept': 'application/json'});
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return 'Le serveur Hubera ID ne répond pas.';
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) return 'Réponse Hubera ID illisible.';
    final url = officialIdApkUrl(Map<String, dynamic>.from(decoded));
    if (url == null) return 'APK officielle introuvable.';
    if (!await HuberaOtaInstaller.canInstallPackages()) {
      await HuberaOtaInstaller.openInstallPermissionSettings();
      return 'Autorise l’installation, puis réessaie. Rien n’a été installé.';
    }
    final dir = await getTemporaryDirectory();
    final dest = File('${dir.path}/hubera-id-offer.apk');
    final apk = await httpClient.get(Uri.parse(url));
    if (apk.statusCode < 200 || apk.statusCode >= 300 || apk.bodyBytes.length < 100 * 1024) {
      return 'Téléchargement refusé.';
    }
    if (apk.bodyBytes.length < 2 || apk.bodyBytes[0] != 0x50 || apk.bodyBytes[1] != 0x4b) {
      return 'Le fichier n’est pas une APK.';
    }
    await dest.writeAsBytes(apk.bodyBytes, flush: true);
    await HuberaOtaInstaller.installApk(dest);
    return 'Installateur Android ouvert. Rien n’est forcé.';
  } catch (_) {
    return 'Proposition Hubera ID impossible.';
  } finally {
    if (ownClient) httpClient.close();
  }
}
