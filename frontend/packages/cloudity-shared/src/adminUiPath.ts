/**
 * Chemin du back-office dans la SPA (obscurcissement d'URL).
 * Les appels API passent toujours par le préfixe gateway `/admin/*` (inchangé).
 *
 * Politique sécurité : aucune redirection ni alias depuis `/admin` vers
 * `${ADMIN_UI_BASE_PATH}` n'est exposée — un ancien signet `/admin/users` n'est
 * **pas** réécrit. Cela évite de confirmer l'existence du back-office via
 * une 30x prévisible. Cf. `docs/securite/AUDIT-SECURITE.md` § 1.
 */
export const ADMIN_UI_BASE_PATH = '/4dm1n' as const

export function adminUiPath(relative = ''): string {
  const r = relative.startsWith('/') ? relative : `/${relative}`
  if (r === '/') return ADMIN_UI_BASE_PATH
  return `${ADMIN_UI_BASE_PATH}${r}`
}

/**
 * Vrai uniquement si le chemin pointe explicitement vers le back-office UI.
 * Les anciens chemins `/admin*` sont rejetés (politique sécurité — aucune
 * redirection auto qui dévoilerait `${ADMIN_UI_BASE_PATH}`).
 */
export function isAdminUiReturnPath(path: string): boolean {
  return path === ADMIN_UI_BASE_PATH || path.startsWith(`${ADMIN_UI_BASE_PATH}/`)
}

/**
 * Renvoie le chemin tel quel s'il est valide pour le back-office, sinon il
 * appartient à l'app utilisateur (pas de réécriture depuis `/admin*`).
 */
export function normalizePostLoginPath(path: string): string {
  return path
}
