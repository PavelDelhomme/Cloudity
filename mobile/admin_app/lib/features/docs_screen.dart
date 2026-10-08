import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const docsScheme = 'hubera-docs://open';
const docsPackages = ['cloud.hubera.docs', 'ovh.delhomme.hubera.docs'];

Uri _nativeLaunchUri(String packageName) {
  return Uri.parse(
    'intent:#Intent;action=android.intent.action.MAIN;'
    'category=android.intent.category.LAUNCHER;'
    'package=$packageName;end',
  );
}

/// Ouvre l’APK Hubera Docs. Jamais de WebView / Chrome du site.
Future<void> openHuberaDocsApp(BuildContext context) async {
  try {
    if (await launchUrl(Uri.parse(docsScheme), mode: LaunchMode.externalApplication)) {
      return;
    }
  } catch (_) {
    /* schéma absent */
  }
  for (final pkg in docsPackages) {
    try {
      if (await launchUrl(_nativeLaunchUri(pkg), mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {
      /* paquet absent */
    }
  }
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Installe l’application Hubera Docs (pas le site web).'),
    ),
  );
}
