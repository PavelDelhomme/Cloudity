import 'package:flutter/material.dart';

import 'cloudity_design_tokens.dart';
import 'suite_app_catalog.dart';

/// En-tête drawer Cloudity (compte + accent produit).
class SuiteDrawerHeader extends StatelessWidget {
  const SuiteDrawerHeader({
    super.key,
    required this.gatewayUrl,
    this.userEmail,
    this.currentApp,
  });

  final String gatewayUrl;
  final String? userEmail;
  final ClouditySuiteApp? currentApp;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final accent = currentApp != null ? CloudityDesignTokens.seedColor(currentApp!) : scheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(height: 4, color: accent),
        Padding(
          padding: EdgeInsets.fromLTRB(
            CloudityDesignTokens.spacing('lg'),
            CloudityDesignTokens.spacing('lg'),
            CloudityDesignTokens.spacing('lg'),
            CloudityDesignTokens.spacing('sm'),
          ),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: accent.withOpacity(0.15),
                foregroundColor: accent,
                child: Icon(currentApp?.icon ?? Icons.person_outline),
              ),
              SizedBox(width: CloudityDesignTokens.spacing('md')),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      userEmail?.trim().isNotEmpty == true ? userEmail!.trim() : 'Compte Cloudity',
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      currentApp?.title ?? gatewayUrl,
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Grille « autres apps Cloudity » (schéma Google Photos / Drive / Keep…).
class SuiteAppSwitcher extends StatelessWidget {
  const SuiteAppSwitcher({
    super.key,
    required this.currentApp,
    this.onOtherAppTap,
  });

  final ClouditySuiteApp currentApp;
  final void Function(ClouditySuiteApp app)? onOtherAppTap;

  @override
  Widget build(BuildContext context) {
    final apps = ClouditySuiteAppMeta.consumerApps;
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: CloudityDesignTokens.spacing('md'),
        vertical: CloudityDesignTokens.spacing('sm'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Apps Cloudity',
            style: Theme.of(context).textTheme.labelLarge,
          ),
          SizedBox(height: CloudityDesignTokens.spacing('sm')),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: CloudityDesignTokens.spacing('sm'),
            crossAxisSpacing: CloudityDesignTokens.spacing('sm'),
            childAspectRatio: 0.85,
            children: [
              for (final app in apps) _AppChip(
                app: app,
                selected: app == currentApp,
                onTap: app == currentApp
                    ? null
                    : () {
                        if (onOtherAppTap != null) {
                          onOtherAppTap!(app);
                        } else {
                          _showOtherAppHint(context, app);
                        }
                      },
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showOtherAppHint(BuildContext context, ClouditySuiteApp app) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.all(CloudityDesignTokens.spacing('xl')),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(app.icon, color: CloudityDesignTokens.seedColor(app)),
                SizedBox(width: CloudityDesignTokens.spacing('md')),
                Text(app.title, style: Theme.of(ctx).textTheme.titleLarge),
              ],
            ),
            SizedBox(height: CloudityDesignTokens.spacing('md')),
            Text(
              'Chaque app Cloudity s’installe séparément (comme Google Photos ou Drive). '
              'Lancez-la avec make run-mobile APP=${app.runMobileName} ou ouvrez ${app.webPath} sur le web.',
            ),
            SizedBox(height: CloudityDesignTokens.spacing('lg')),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
            ),
          ],
        ),
      ),
    );
  }
}

class _AppChip extends StatelessWidget {
  const _AppChip({
    required this.app,
    required this.selected,
    this.onTap,
  });

  final ClouditySuiteApp app;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final accent = CloudityDesignTokens.seedColor(app);
    return Material(
      color: selected ? accent.withOpacity(0.12) : Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('md')),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('md')),
        child: Padding(
          padding: EdgeInsets.all(CloudityDesignTokens.spacing('xs')),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(app.icon, color: accent, size: 26),
              SizedBox(height: CloudityDesignTokens.spacing('xs')),
              Text(
                app.title,
                style: Theme.of(context).textTheme.labelSmall,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pied de drawer standard : paramètres + déconnexion.
class SuiteDrawerFooter extends StatelessWidget {
  const SuiteDrawerFooter({
    super.key,
    required this.showSettings,
    required this.onOpenSettings,
    required this.onLogout,
  });

  final bool showSettings;
  final VoidCallback onOpenSettings;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Divider(height: 1),
        ListTile(
          leading: const Icon(Icons.settings_outlined),
          title: const Text('Paramètres'),
          selected: showSettings,
          onTap: onOpenSettings,
        ),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Déconnexion'),
          onTap: () => onLogout(),
        ),
      ],
    );
  }
}

/// Scaffold suite : AppBar + drawer unifié + corps produit.
class SuiteDrawerScaffold extends StatelessWidget {
  const SuiteDrawerScaffold({
    super.key,
    required this.currentApp,
    required this.title,
    required this.gatewayUrl,
    required this.body,
    required this.showSettings,
    required this.onOpenSettings,
    required this.onCloseSettings,
    required this.onLogout,
    this.userEmail,
    this.navItems = const [],
    this.appBarActions = const [],
    this.settingsBody,
  });

  final ClouditySuiteApp currentApp;
  final String title;
  final String gatewayUrl;
  final String? userEmail;
  final Widget body;
  final bool showSettings;
  final List<Widget> navItems;
  final List<Widget> appBarActions;
  final VoidCallback onOpenSettings;
  final VoidCallback onCloseSettings;
  final Future<void> Function() onLogout;
  final Widget? settingsBody;

  Widget _buildDrawer(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  SuiteDrawerHeader(
                    gatewayUrl: gatewayUrl,
                    userEmail: userEmail,
                    currentApp: currentApp,
                  ),
                  const Divider(height: 1),
                  ...navItems,
                  const Divider(height: 1),
                  SuiteAppSwitcher(currentApp: currentApp),
                ],
              ),
            ),
            SuiteDrawerFooter(
              showSettings: showSettings,
              onOpenSettings: () {
                Navigator.pop(context);
                onOpenSettings();
              },
              onLogout: () async {
                Navigator.pop(context);
                await onLogout();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: appBarActions,
      ),
      drawer: _buildDrawer(context),
      body: showSettings ? (settingsBody ?? const SizedBox.shrink()) : body,
    );
  }
}
