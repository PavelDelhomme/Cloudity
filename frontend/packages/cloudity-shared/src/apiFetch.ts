/**
 * `apiFetch` / `apiJson` — helpers HTTP partagés (A2/A3, STATUS §0b).
 *
 * Combine `apiUrl` + `getAuthHeaders` + gestion d'erreur HTTP pour réduire la dette
 * dans `@cloudity/web/api.ts` (~100 `fetch` quasi identiques, ~99 `throw new Error`).
 *
 * Conçu pour être adopté **incrémentalement** : `apiFetch` retourne la `Response`
 * brute (l'appelant fait `.json()/.text()/.blob()`) et `apiJson<T>` parse + lève
 * une erreur normalisée si `!res.ok` (avec extraction `detail` ou `error` du body
 * JSON quand disponible — pratique côté admin/Tenant).
 */

import { apiUrl } from './cloudityCore'
import { getAuthHeaders } from './authHeaders'

export type ApiFetchInit = Omit<RequestInit, 'headers'> & {
  /** Headers additionnels (fusionnés après `getAuthHeaders`). */
  headers?: Record<string, string>
  /**
   * `Content-Type: application/json` ?
   * - `true` (défaut) : ajoute le header (utile pour POST/PATCH/PUT JSON).
   * - `false` : à mettre pour GET/DELETE sans body, blobs, multipart…
   */
  json?: boolean
}

/**
 * Appel fetch authentifié vers `apiUrl(path)`.
 * - Renvoie la `Response` ; l'appelant choisit `.json()` / `.text()` / `.blob()`.
 * - Ne lève pas d'erreur HTTP (utiliser `apiJson` ou tester `res.ok` soi-même).
 */
export function apiFetch(
  token: string | null | undefined,
  path: string,
  init?: ApiFetchInit
): Promise<Response> {
  const { json, headers, ...rest } = init ?? {}
  const merged: Record<string, string> = {
    ...getAuthHeaders(token, { json: json !== false }),
    ...(headers ?? {}),
  }
  return fetch(apiUrl(path), { ...rest, headers: merged })
}

/**
 * Variante `apiFetch` qui parse en JSON et **lève** une erreur normalisée si `!res.ok`.
 *
 * - `errorPrefix` (défaut `HTTP`) : préfixe utilisé dans le message (`"<prefix>: <status>"`).
 * - Tente d'extraire `detail` ou `error` du body JSON pour un message plus parlant
 *   (les services Cloudity renvoient `{ "detail": "…" }` côté FastAPI et
 *   `{ "error": "…" }` côté Go).
 */
export async function apiJson<T = unknown>(
  token: string | null | undefined,
  path: string,
  init?: ApiFetchInit,
  errorPrefix = 'HTTP'
): Promise<T> {
  const res = await apiFetch(token, path, init)
  if (!res.ok) {
    let message = `${errorPrefix}: ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string; error?: string }
      const extra = body.detail || body.error
      if (extra) message = extra
    } catch {
      /* body non JSON ou vide — on garde le message par défaut */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}
