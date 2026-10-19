import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Réglages du compte déjà administrateur, et de Hubera Admin.
/// Jamais l’écran de connexion : la session est déjà là.
class AdminAccountSettings extends StatefulWidget {
  const AdminAccountSettings({
    super.key,
    required this.gatewayUrl,
    required this.email,
  });

  final String gatewayUrl;
  final String email;

  @override
  State<AdminAccountSettings> createState() => _AdminAccountSettingsState();
}

class _AdminAccountSettingsState extends State<AdminAccountSettings> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final code = info.buildNumber.trim();
      final label = version.isEmpty
          ? ''
          : (code.isEmpty ? version : '$version · code $code');
      if (!mounted || label.isEmpty) return;
      setState(() => _version = label);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final account = widget.email.trim();
    final themeState = CloudityThemedAppScope.maybeOf(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Paramètres du compte', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.account_circle_outlined),
          title: Text(account.isEmpty ? 'Compte administrateur' : account),
          subtitle: const Text('Compte déjà connecté'),
        ),
        const SizedBox(height: 16),
        Text('Paramètres de l\'application', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        const ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.admin_panel_settings_outlined),
          title: Text('Hubera Admin'),
          subtitle: Text('Réglages de cette application'),
        ),
        if (themeState != null)
          CloudityThemeModeTile(
            mode: themeState.themeMode,
            onChanged: themeState.setThemeMode,
          ),
        if (_version.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.info_outline),
            title: Text('Version $_version'),
            subtitle: const Text('Proposée, jamais forcée.'),
          ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.system_update_alt),
          title: const Text('Vérifier les mises à jour'),
          subtitle: const Text('En plus de la détection automatique. Proposée, jamais forcée.'),
          onTap: () => cloudityCheckUpdateManually(
            context,
            gatewayBase: widget.gatewayUrl,
            appSlug: ClouditySuiteApp.admin.otaAppSlug,
            appName: 'Hubera Admin',
            huberaHost: ClouditySuiteApp.admin.huberaHost,
          ),
        ),
      ],
    );
  }
}
