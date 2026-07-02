/// Dossiers mail standard Cloudity (alignés web `mailViewPreferences.ts`).
abstract final class MailStandardFolders {
  static const inbox = 'inbox';
  static const sent = 'sent';
  static const drafts = 'drafts';
  static const archive = 'archive';
  static const spam = 'spam';
  static const trash = 'trash';
  static const all = 'all';
  static const unified = 'unified';
  static const scheduled = 'scheduled';

  static const standardSet = {
    inbox,
    sent,
    drafts,
    archive,
    spam,
    trash,
    all,
    unified,
    scheduled,
  };

  /// Libellés UI (français, vocabulaire commun web/mobile).
  static const labels = {
    inbox: 'Réception',
    sent: 'Envoyés',
    drafts: 'Brouillons',
    archive: 'Archive',
    spam: 'Spam',
    trash: 'Corbeille',
    all: 'Tous les messages',
    unified: 'Vue unifiée',
    scheduled: 'Programmée',
  };

  static String labelFor(String folder) =>
      labels[folder.trim().toLowerCase()] ?? folder;

  static bool isStandard(String folder) =>
      standardSet.contains(folder.trim().toLowerCase());
}

/// Ordre sidebar web : vues puis standard.
const mailSidebarStandardOrder = [
  MailStandardFolders.inbox,
  MailStandardFolders.sent,
  MailStandardFolders.drafts,
  MailStandardFolders.scheduled,
  MailStandardFolders.archive,
  MailStandardFolders.spam,
  MailStandardFolders.trash,
];
