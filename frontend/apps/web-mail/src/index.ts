/**
 * @cloudity/web-mail — surface publique (FE-SPLIT-01).
 * Le shell cloudity-web importe MailPage en lazy ; les libs sync/notif restent exportées
 * pour AppLayout / settings / Pass jusqu’à découplage complet.
 */
export { default as MailPage } from './mail/MailPage'
export { accountCanBackgroundImapSync } from './mail/mailSyncHelpers'
export {
  registerMailNotificationClickHandler,
  requestMailDesktopNotifications,
  getMailDesktopNotificationStatus,
  setMailDesktopNotificationsEnabled,
  isMailDesktopNotificationsEnabled,
  showMailDesktopNotification,
  type MailDesktopNotificationStatus,
} from './lib/mailDesktopNotifications'
export { notifyNewMailMessages } from './lib/mailNotifyNewMessages'
export { notifyMailSyncFailure } from './lib/mailNotifySyncFailure'
export { coordinatedSyncMailAccount } from './lib/mailSyncCoordinator'
export {
  effectiveAliasHostSuffix,
  resolveAliasEmailInput,
  subscribeAliasSuffixChanges,
  getStoredAliasHostSuffix,
  setStoredAliasHostSuffix,
  notifyAliasSuffixChanged,
} from './lib/mailAlias'
export { default as MailAliasDomainConfig } from './components/mail/MailAliasDomainConfig'
