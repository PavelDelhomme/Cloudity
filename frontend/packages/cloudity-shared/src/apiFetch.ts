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
 * Erreur HTTP enrichie : expose `status` numérique pour que les handlers
 * (ex. `Global401Handler`) puissent filtrer sans deviner via le texte.
 * `message` conserve toujours le code HTTP, même quand le body contient
 * `detail`/`error` — sinon `error.message.includes('401')` peut échouer
 * silencieusement, laisser le frontend en boucle de retries et bloquer la
 * redirection vers `/login` (cf. AUDIT-SECURITE-ADMIN-API.md).
 */
export class ApiError extends Error {
  public readonly status: number
  public readonly path: string
  public readonly bodyDetail?: string
  constructor(message: string, status: number, path: string, bodyDetail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.bodyDetail = bodyDetail
  }
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
    let bodyDetail: string | undefined
    try {
      const body = (await res.json()) as { detail?: string; error?: string }
      bodyDetail = body.detail || body.error || undefined
    } catch {
      /* body non JSON ou vide */
    }
    const message = bodyDetail
      ? `${errorPrefix}: ${res.status} — ${bodyDetail}`
      : `${errorPrefix}: ${res.status}`
    throw new ApiError(message, res.status, path, bodyDetail)
  }
  return res.json() as Promise<T>
}

/**
 * Variante typée pour les réponses JSON qui incluent au minimum `{ ok: boolean }`
 * (très fréquent côté microservices Go / routes utilitaires).
 *
 * Exemple : `apiJsonOk(token, '/mail/...', { method: 'PATCH', body: … }, 'Patch')`
 * ou `apiJsonOk<{ ok: boolean; affected: number }>(...)`.
 */
export type ApiOkJson = { ok: boolean }

export async function apiJsonOk<T extends ApiOkJson = ApiOkJson>(
  token: string | null | undefined,
  path: string,
  init?: ApiFetchInit,
  errorPrefix = 'HTTP'
): Promise<T> {
  return apiJson<T>(token, path, init, errorPrefix)
}
