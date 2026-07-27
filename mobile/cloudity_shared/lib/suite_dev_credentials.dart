import 'package:flutter/material.dart';

/// Identifiants dev injectés via `--dart-define` (run-mobile.sh lit `.env`).
/// Aucune valeur en dur dans le dépôt — évite les alertes GitGuardian / gitleaks.
abstract final class ClouditySuiteDevCredentials {
  static const email = String.fromEnvironment('CLOUDITY_DEV_EMAIL');
  static const password = String.fromEnvironment('CLOUDITY_DEV_PASSWORD');

  static void prefill(TextEditingController emailCtrl, TextEditingController passwordCtrl) {
    if (email.isNotEmpty && emailCtrl.text.trim().isEmpty) {
      emailCtrl.text = email;
    }
    if (password.isNotEmpty && passwordCtrl.text.isEmpty) {
      passwordCtrl.text = password;
    }
  }
}
