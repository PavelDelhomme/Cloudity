/// Décision au premier lancement. Android ne peut pas installer un second
/// paquet en silence : Hubera ID est proposé, jamais glissé dans l’autre APK.
enum HuberaIdLaunch {
  /// ID est déjà là : reprendre le compte, sans mot de passe.
  resume,

  /// ID manque : proposer l’APK officielle, seulement si la personne accepte.
  offerApk,

  /// Pas de binaire iOS dans les dépôts : ne pas inventer une fiche.
  noIosBinary,
}

class HuberaIdLaunchPlan {
  const HuberaIdLaunchPlan(this.action);

  final HuberaIdLaunch action;

  /// Une mise à jour de l’app ne vide pas la session Hubera ID.
  bool get clearSessionOnUpdate => false;

  /// Jamais d’installation silencieuse d’un second paquet.
  bool get silentInstall => false;
}

/// ID 0.1.12, code 112 : première version qui reprend le compte déjà sur l’appareil.
const huberaIdSessionMinimumCode = 112;

/// Même formule que les APK Hubera : 0.1.3 → 103, 0.1.12 → 112, 0.1.16 → 116.
int huberaVersionCode(String version) {
  final clean = version.replaceFirst(RegExp(r'^[pbd]\+'), '').split('+').first.split('-').first;
  final parts = clean.split('.');
  int at(int i) => i < parts.length ? int.tryParse(parts[i]) ?? 0 : 0;
  return at(0) * 10000 + at(1) * 100 + at(2);
}

HuberaIdLaunchPlan planHuberaIdLaunch({
  required bool android,
  required bool idInstalled,
  int? installedVersionCode,
  int? minimumSessionCode,
}) {
  if (!android) return const HuberaIdLaunchPlan(HuberaIdLaunch.noIosBinary);
  if (!idInstalled) return const HuberaIdLaunchPlan(HuberaIdLaunch.offerApk);
  if (installedVersionCode != null &&
      minimumSessionCode != null &&
      installedVersionCode < minimumSessionCode) {
    return const HuberaIdLaunchPlan(HuberaIdLaunch.offerApk);
  }
  return const HuberaIdLaunchPlan(HuberaIdLaunch.resume);
}

/// URL d’APK officielle Hubera ID. Refuse une page web ou un autre hôte.
String? officialIdApkUrl(Map<String, dynamic> feed) {
  final canonical = feed['canonical'];
  final slot = canonical is Map ? Map<String, dynamic>.from(canonical) : feed;
  final pkg = (slot['package'] ?? feed['package'] ?? '').toString();
  if (pkg.isNotEmpty && pkg != 'cloud.hubera.id') return null;
  final url = (slot['apk_url'] ?? slot['apk'] ?? feed['apk_url'] ?? feed['apk'] ?? '')
      .toString()
      .trim();
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https' || uri.host != 'id.hubera.cloud') {
    return null;
  }
  if (url.endsWith('.html') || url.endsWith('/install') || url.endsWith('/')) {
    return null;
  }
  return url;
}
