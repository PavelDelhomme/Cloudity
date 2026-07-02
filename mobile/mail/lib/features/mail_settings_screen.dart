import 'package:flutter/material.dart';

import 'mail_account_helpers.dart';
import 'mail_imap_password_screen.dart';
import '../auth/user_session.dart';

/// Paramètres Mail (MVP) — aligné web : comptes, MDP IMAP, lien vers réglages web.
class MailSettingsScreen extends StatelessWidget {
  const MailSettingsScreen({
    super.key,
    required this.session,
    required this.accounts,
    required this.onAccountsChanged,
  });

  final UserSession session;
  final List<Map<String, dynamic>> accounts;
  final Future<void> Function() onAccountsChanged;

  Future<void> _openImapPassword(
    BuildContext context,
    Map<String, dynamic> acc,
  ) async {
    final rawId = acc['id'];
    final id = rawId is int ? rawId : int.tryParse(rawId?.toString() ?? '');
    if (id == null) return;
    final email = acc['email']?.toString() ?? '';
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => MailImapPasswordScreen(
          api: session.api,
          accessToken: session.accessToken,
          accountId: id,
          accountEmail: email,
          lastSyncError: acc['last_sync_error']?.toString(),
        ),
      ),
    );
    if (ok == true) {
      await onAccountsChanged();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Mot de passe enregistré — synchronisation relancée'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final gateway = session.api.baseUrl;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Paramètres Mail', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          'Compte Cloudity : $gateway',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 24),
        Text('Boîtes mail', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        ...accounts.map((acc) {
          final email = acc['email']?.toString() ?? '';
          final label = acc['label']?.toString().trim();
          final hasIssue = mailAccountHasSyncIssue(acc);
          return Card(
            child: ListTile(
              leading: Icon(
                hasIssue ? Icons.warning_amber_rounded : Icons.mail_outline,
                color: hasIssue ? Colors.amber.shade800 : null,
              ),
              title: Text(label?.isNotEmpty == true ? label! : email),
              subtitle: label?.isNotEmpty == true ? Text(email) : null,
              trailing: const Icon(Icons.vpn_key_outlined),
              onTap: () => _openImapPassword(context, acc),
            ),
          );
        }),
        const SizedBox(height: 24),
        Text('Suite Cloudity', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.open_in_browser),
            title: const Text('Règles et alias (web)'),
            subtitle: const Text('Alias, domaines, filtres avancés'),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Ouvrez $gateway/app/mail dans le navigateur'),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Paramètres suite'),
            subtitle: const Text('Compte, sécurité, thème'),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Ouvrez $gateway/app/settings dans le navigateur'),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
