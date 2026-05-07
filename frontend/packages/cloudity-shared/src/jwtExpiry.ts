/**
 * Lit `exp` (secondes UNIX) du payload JWT sans dépendance externe.
 * Si le token n’est pas un JWT ou n’a pas `exp`, retourne null (on ne bloque pas la requête).
 */
export function getJwtPayloadExpMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad === 2) b64 += '=='
    else if (pad === 3) b64 += '='
    else if (pad === 1) return null
    const json = atob(b64)
    const payload = JSON.parse(json) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/** True si le JWT semble encore valable au moins `skewMs` après maintenant. */
export function isAccessTokenUsable(token: string | null, skewMs = 90_000): boolean {
  if (!token) return false
  const expMs = getJwtPayloadExpMs(token)
  if (expMs == null) return true
  return Date.now() + skewMs < expMs
}
