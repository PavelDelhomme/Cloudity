/**
 * Décode le payload JWT (sans vérifier la signature) — aligné sur la logique gateway tokenHasAdminRole.
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad === 2) b64 += '=='
    else if (pad === 3) b64 += '='
    else if (pad === 1) return null
    const json = atob(b64)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function jwtPayloadHasAdminRole(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false
  const role = payload.role
  if (typeof role === 'string' && role.trim().toLowerCase() === 'admin') return true
  const roles = payload.roles
  if (Array.isArray(roles)) {
    for (const raw of roles) {
      if (typeof raw === 'string' && raw.trim().toLowerCase() === 'admin') return true
    }
  }
  return false
}

/** Indique si le JWT d’accès courant porte le rôle admin (UX : avant appel API). */
export function accessTokenHasAdminRole(token: string | null | undefined): boolean {
  if (!token) return false
  return jwtPayloadHasAdminRole(parseJwtPayload(token))
}
