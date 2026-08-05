/** Erreurs API sync IMAP : mot de passe manquant ou secret illisible (clé tournée). */
export function isMailSyncPasswordRequiredError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return (
    m.includes('mot de passe requis pour la synchronisation') ||
    m.includes("secret enregistré n'est plus lisible") ||
    m.includes('MAIL_PASSWORD_ENCRYPTION_KEY changée') ||
    m.includes('mot de passe IMAP requis ou secret illisible')
  )
}

/** Échec d'authentification IMAP/OAuth (mot de passe changé côté fournisseur, jeton révoqué, etc.). */
export function isMailSyncAuthFailureError(e: unknown): boolean {
  if (isMailSyncPasswordRequiredError(e)) return true
  const m = e instanceof Error ? e.message : String(e)
  return (
    m.includes('Identifiants refusés') ||
    m.includes('OAuth Google expiré') ||
    m.includes('connexion IMAP OAuth échouée') ||
    m.includes('Reconnectez la boîte') ||
    m.includes('Reconnectez avec Google') ||
    m.includes("mot de passe d'application Gmail") ||
    m.includes('impossible de lire le jeton')
  )
}

export function accountHasSyncIssue(acc: {
  last_sync_error?: string | null
  imap_auth_ready?: boolean
}): boolean {
  return Boolean(acc.last_sync_error?.trim()) || acc.imap_auth_ready === false
}

const PROMPT_KEY = 'cloudity_mail_sync_password_prompted'

function readPromptedIds(): number[] {
  try {
    const raw = sessionStorage.getItem(PROMPT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number' && x > 0)
  } catch {
    return []
  }
}

function writePromptedIds(ids: number[]) {
  try {
    sessionStorage.setItem(PROMPT_KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    /* quota / mode privé */
  }
}

/** Une seule modale / toast par boîte et par session (évite le spam du polling). */
export function shouldPromptMailSyncPassword(accountId: number): boolean {
  return !readPromptedIds().includes(accountId)
}

export function markMailSyncPasswordPrompted(accountId: number) {
  writePromptedIds([...readPromptedIds(), accountId])
}

export function clearMailSyncPasswordPrompt(accountId: number) {
  writePromptedIds(readPromptedIds().filter((id) => id !== accountId))
}

/** Compte prêt pour sync auto (OAuth ou mot de passe déjà enregistré côté serveur). */
export function accountCanBackgroundImapSync(acc: { imap_auth_ready?: boolean }): boolean {
  return acc.imap_auth_ready !== false
}
