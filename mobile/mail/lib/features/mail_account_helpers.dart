/// Helpers pour l'état des comptes mail (`GET /mail/me/accounts`).
library;

String? mailAccountLabel(Map<String, dynamic> account) {
  final label = account['label']?.toString().trim() ?? '';
  if (label.isNotEmpty) return label;
  final email = account['email']?.toString().trim() ?? '';
  return email.isNotEmpty ? email : null;
}

bool mailAccountImapAuthReady(Map<String, dynamic> account) {
  final ready = account['imap_auth_ready'];
  if (ready is bool) return ready;
  return true;
}

String? mailAccountLastSyncError(Map<String, dynamic> account) {
  final err = account['last_sync_error']?.toString().trim();
  if (err != null && err.isNotEmpty) return err;
  return null;
}

bool mailAccountHasSyncIssue(Map<String, dynamic> account) {
  if (!mailAccountImapAuthReady(account)) return true;
  return mailAccountLastSyncError(account) != null;
}

String mailAccountSyncIssueMessage(Map<String, dynamic> account) {
  return mailAccountLastSyncError(account) ??
      'Connexion IMAP à reconfigurer — resaisissez le mot de passe depuis le web (Mail → Paramètres).';
}
