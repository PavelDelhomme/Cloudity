import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';

/// Chip compte de l’AppBar, calé sur [HuberaAccountAvatar].
/// Le tap ouvre le menu. La déconnexion est une entrée de ce menu.
class AdminAccountChip extends StatelessWidget {
  const AdminAccountChip({
    super.key,
    required this.onOpenSettings,
    required this.onLogout,
    this.email,
  });

  final String? email;
  final VoidCallback onOpenSettings;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final account = email?.trim() ?? '';
    return PopupMenuButton<String>(
      tooltip: 'Compte',
      offset: const Offset(0, 40),
      icon: const Icon(Icons.account_circle_outlined),
      onSelected: (value) {
        switch (value) {
          case 'settings':
            onOpenSettings();
          case 'choose':
          case 'add':
            HuberaAccountSwitch.requestChooser();
          case 'id':
            openHuberaProduct(HuberaProduct.id);
          case 'logout':
            onLogout();
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'settings',
          child: ListTile(
            dense: true,
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Réglages de cette app'),
            subtitle: account.isEmpty
                ? null
                : Text(account, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
        const PopupMenuItem(
          value: 'choose',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.switch_account_outlined),
            title: Text('Choisir un compte'),
          ),
        ),
        const PopupMenuItem(
          value: 'add',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.person_add_outlined),
            title: Text('Ajouter un compte'),
          ),
        ),
        const PopupMenuItem(
          value: 'id',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.privacy_tip_outlined),
            title: Text('Hubera ID · confidentialité'),
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: 'logout',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.logout),
            title: Text('Déconnexion'),
          ),
        ),
      ],
    );
  }
}
