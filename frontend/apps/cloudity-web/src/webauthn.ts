// Helpers WebAuthn / passkeys côté navigateur (Phase W2).
// Voir docs/securite/WEBAUTHN-PLAN.md.
import { apiFetch, apiJson, apiUrl } from './api'

// --- Encodage / décodage base64url <-> ArrayBuffer ---------------------

const b64uToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const bytesToB64u = (buf: ArrayBuffer | ArrayBufferView): string => {
  const u = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array((buf as ArrayBufferView).buffer)
  let bin = ''
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// PublicKeyCredentialCreationOptions / RequestOptions venus du backend
// arrivent en JSON ; les champs binaires (`challenge`, `id`, `userHandle`,
// `excludeCredentials[].id`, etc.) sont en base64url. On les convertit en
// `BufferSource` attendu par `navigator.credentials.create/get`.
function reviveCreationOpts(raw: any): PublicKeyCredentialCreationOptions {
  const opts: any = { ...raw }
  opts.challenge = b64uToBytes(opts.challenge).buffer
  opts.user = { ...opts.user, id: b64uToBytes(opts.user.id).buffer }
  if (Array.isArray(opts.excludeCredentials)) {
    opts.excludeCredentials = opts.excludeCredentials.map((c: any) => ({
      ...c,
      id: b64uToBytes(c.id).buffer,
    }))
  }
  return opts as PublicKeyCredentialCreationOptions
}

function reviveRequestOpts(raw: any): PublicKeyCredentialRequestOptions {
  const opts: any = { ...raw }
  opts.challenge = b64uToBytes(opts.challenge).buffer
  if (Array.isArray(opts.allowCredentials)) {
    opts.allowCredentials = opts.allowCredentials.map((c: any) => ({
      ...c,
      id: b64uToBytes(c.id).buffer,
    }))
  }
  return opts as PublicKeyCredentialRequestOptions
}

function attestationToJSON(cred: PublicKeyCredential): any {
  const r = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64u(r.clientDataJSON),
      attestationObject: bytesToB64u(r.attestationObject),
      transports:
        typeof (r as any).getTransports === 'function' ? (r as any).getTransports() : [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}

function assertionToJSON(cred: PublicKeyCredential): any {
  const r = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64u(r.clientDataJSON),
      authenticatorData: bytesToB64u(r.authenticatorData),
      signature: bytesToB64u(r.signature),
      userHandle: r.userHandle ? bytesToB64u(r.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}

// --- Types backend ------------------------------------------------------

export interface PasskeyView {
  id: string
  credential_id: string
  nickname: string
  attestation_fmt: string
  transports: string[]
  backup_eligible: boolean
  backup_state: boolean
  sign_count: number
  created_at: string
  last_used_at?: string
}

export const isWebAuthnSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.credentials?.create === 'function'

// --- Endpoints ---------------------------------------------------------

export async function listPasskeys(token: string): Promise<PasskeyView[]> {
  const data = await apiJson<{ credentials: PasskeyView[] }>(
    token,
    '/auth/webauthn/credentials',
    undefined,
    'WebAuthn credentials',
  )
  return data.credentials ?? []
}

export async function deletePasskey(token: string, id: string): Promise<void> {
  const res = await apiFetch(token, `/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    json: false,
  })
  if (!res.ok) {
    throw new Error(`Suppression passkey: ${res.status}`)
  }
}

/** Enrôle une passkey pour l'admin connecté. Renvoie l'ID base64url du nouveau credential. */
export async function registerPasskey(token: string, nickname?: string): Promise<{ credential_id: string }> {
  if (!isWebAuthnSupported()) {
    throw new Error("Ce navigateur ne supporte pas WebAuthn / passkeys.")
  }
  const beginRes = await fetch(apiUrl('/auth/webauthn/register/begin'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!beginRes.ok) {
    throw new Error(`register/begin: ${beginRes.status}`)
  }
  const beginRaw = await beginRes.json()
  const opts = reviveCreationOpts(beginRaw.publicKey ?? beginRaw)
  const cred = (await navigator.credentials.create({ publicKey: opts })) as PublicKeyCredential | null
  if (!cred) throw new Error('navigator.credentials.create a renvoyé null')

  const finishUrl = nickname
    ? `/auth/webauthn/register/finish?nickname=${encodeURIComponent(nickname)}`
    : '/auth/webauthn/register/finish'
  const finishRes = await fetch(apiUrl(finishUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(attestationToJSON(cred)),
  })
  if (!finishRes.ok) {
    throw new Error(`register/finish: ${finishRes.status} ${await finishRes.text()}`)
  }
  return finishRes.json()
}

/**
 * Connexion passkey **discoverable** — sans email préalable. Le password
 * manager (Proton Pass, iCloud Keychain, Bitwarden, 1Password) propose la
 * passkey directement au focus du champ email grâce au mode `conditional`.
 *
 * - `mediation: 'conditional'` : affichage non-modal. La promise reste en
 *   attente jusqu'à ce que l'utilisateur sélectionne une passkey via la
 *   suggestion du browser.
 * - `signal` : pour annuler quand l'utilisateur préfère taper son mot de
 *   passe.
 *
 * Retourne { access_token, refresh_token, role, user_id, email } — ou null
 * si annulé.
 */
export async function loginWithPasskeyDiscoverable(
  tenantId: string,
  signal?: AbortSignal,
): Promise<{ access_token: string; refresh_token: string; role: string; user_id: string; email: string } | null> {
  if (!isWebAuthnSupported()) return null
  // Vérifie que le browser supporte la Conditional UI (Chrome ≥108, Safari
  // ≥16, Firefox ≥119). Sinon on n'expose pas le bouton.
  if (typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
    try {
      const ok = await PublicKeyCredential.isConditionalMediationAvailable()
      if (!ok) return null
    } catch {
      return null
    }
  } else {
    return null
  }

  const beginRes = await fetch(apiUrl('/auth/webauthn/login/begin-discoverable'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId }),
  })
  if (!beginRes.ok) return null
  const beginJson = await beginRes.json()
  const opts = reviveRequestOpts(beginJson.options.publicKey ?? beginJson.options)
  const challengeB64u = bytesToB64u(opts.challenge as ArrayBuffer)

  let assertion: PublicKeyCredential | null = null
  try {
    assertion = (await navigator.credentials.get({
      publicKey: opts,
      mediation: 'conditional',
      signal,
    })) as PublicKeyCredential | null
  } catch (e) {
    // AbortError ou NotAllowedError = utilisateur a annulé / pas de match.
    return null
  }
  if (!assertion) return null

  const finishRes = await fetch(apiUrl('/auth/webauthn/login/finish-discoverable'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      challenge: challengeB64u,
      assertion: assertionToJSON(assertion),
    }),
  })
  if (!finishRes.ok) return null
  return finishRes.json()
}

/** Connexion passkey. Renvoie access + refresh tokens (à stocker comme login mot de passe). */
export async function loginWithPasskey(
  email: string,
  tenantId: string,
): Promise<{ access_token: string; refresh_token: string; role: string }> {
  if (!isWebAuthnSupported()) {
    throw new Error('Ce navigateur ne supporte pas WebAuthn / passkeys.')
  }
  const beginRes = await fetch(apiUrl('/auth/webauthn/login/begin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, tenant_id: tenantId }),
  })
  if (!beginRes.ok) {
    throw new Error(`login/begin: ${beginRes.status}`)
  }
  const beginJson = await beginRes.json()
  const userId: string = beginJson.user_id
  const opts = reviveRequestOpts(beginJson.options.publicKey ?? beginJson.options)
  const assertion = (await navigator.credentials.get({ publicKey: opts })) as PublicKeyCredential | null
  if (!assertion) throw new Error('navigator.credentials.get a renvoyé null')

  const finishRes = await fetch(apiUrl('/auth/webauthn/login/finish'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      tenant_id: tenantId,
      assertion: assertionToJSON(assertion),
    }),
  })
  if (!finishRes.ok) {
    throw new Error(`login/finish: ${finishRes.status}`)
  }
  return finishRes.json()
}
