/**
 * Helpers headers HTTP partagés (A2/A3, STATUS §0b).
 *
 * Centralise la construction des entêtes d'autorisation et JSON pour éviter la duplication
 * de `Authorization: Bearer …` dans chaque module API ; consommé par `@cloudity/web`
 * (commencer par `api.ts`) puis par d'éventuelles autres apps front.
 */

export type AuthHeadersOptions = {
  /** Ajout de `Content-Type: application/json` (défaut: true). */
  json?: boolean
  /** Headers supplémentaires (ex. `Accept`, `X-Cloudity-Perf-Ingest`). */
  extra?: Record<string, string>
}

/**
 * Construit les en-têtes pour un appel API authentifié.
 * - Renvoie un objet vide si `token` est vide/null/undefined (l'appelant gère l'authent par ailleurs).
 * - `Content-Type` JSON par défaut, désactivable via `options.json = false` (utile pour `multipart/form-data`).
 */
export function getAuthHeaders(
  token: string | null | undefined,
  options?: AuthHeadersOptions
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (options?.json !== false) headers['Content-Type'] = 'application/json'
  if (options?.extra) {
    for (const [k, v] of Object.entries(options.extra)) headers[k] = v
  }
  return headers
}
