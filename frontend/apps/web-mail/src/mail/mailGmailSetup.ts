/** Aide affichée dans la modale d’ajout. Noms de variables seulement, aucun secret. */
export const mailGmailOAuthDoc = 'docs/produit/MAIL-GMAIL-OAUTH.md'

export function mailGmailSetupHint(enabled: boolean): string {
  if (enabled) {
    return 'Fenêtre Google : autorisez l’accès à la boîte. Le retour vers Mail se fait ensuite tout seul.'
  }
  return [
    'Gmail en un clic n’est pas branché sur ce serveur.',
    'À renseigner (vides ici, jamais une vraie valeur dans git) : GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI (callback de la gateway, chemin /mail/me/oauth/google/callback) et MAIL_OAUTH_FRONTEND_URL (page Mail après le consentement).',
    'Côté Google : API Gmail activée, écran de consentement, scopes https://mail.google.com/, openid et email, et les comptes de test.',
    `Le pas à pas est dans ${mailGmailOAuthDoc}.`,
    'Sans ces variables, une adresse Gmail se relie avec un mot de passe d’application, pas le mot de passe du compte Google.',
  ].join(' ')
}
