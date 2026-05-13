/**
 * TOTP RFC 6238 — calcul d'un code à 6 chiffres à partir d'un secret base32 et
 * d'un timestamp. Utilisé pour afficher le code 2FA d'un item Pass.
 *
 * Spec :
 *  - HOTP RFC 4226 (HMAC-based OTP) : `T = floor(now / period)`, `HOTP(K,T)`.
 *  - TOTP RFC 6238  : variante temporelle, `digits` chiffres (généralement 6),
 *                     `period` secondes (généralement 30), `algorithm` SHA-1
 *                     (par défaut, mais SHA-256 / SHA-512 supportés).
 *  - Format URI    : `otpauth://totp/Issuer:account?secret=BASE32&issuer=Issuer&algorithm=SHA1&digits=6&period=30`
 *
 * Tout est calculé **côté client** dans le navigateur (Web Crypto API
 * `crypto.subtle.importKey` + `sign('HMAC')`). Le secret n'est jamais envoyé
 * au serveur — il est chiffré dans `EnvelopeV1` comme le reste de l'item.
 */

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpParams {
  /** Secret en base32 RFC 4648 (peut contenir des espaces ou des minuscules). */
  secret: string
  /** Période en secondes (default 30). */
  period?: number
  /** Nombre de chiffres dans le code (default 6, parfois 8). */
  digits?: number
  /** Algorithme HMAC (default SHA-1, conforme RFC 6238 et Google Authenticator). */
  algorithm?: TotpAlgorithm
}

export interface ParsedOtpauth extends TotpParams {
  type: 'totp' | 'hotp'
  issuer?: string
  accountName?: string
  /** Pour HOTP uniquement. */
  counter?: number
}

// --- Public API --------------------------------------------------------

/**
 * Génère le code OTP courant pour `params` au moment `nowMs` (epoch ms).
 * Renvoie une chaîne de `digits` chiffres, padée à gauche par des '0'.
 *
 * @throws Error si le secret base32 est invalide.
 */
export async function generateTotp(params: TotpParams, nowMs: number = Date.now()): Promise<string> {
  const period = params.period ?? 30
  const digits = params.digits ?? 6
  const alg = params.algorithm ?? 'SHA-1'
  if (period <= 0) throw new Error('period must be > 0')
  if (digits < 6 || digits > 10) throw new Error('digits must be between 6 and 10')

  const counter = Math.floor(nowMs / 1000 / period)
  const key = base32Decode(params.secret)
  if (key.length === 0) throw new Error('Empty TOTP secret')

  return hotp(key, counter, digits, alg)
}

/**
 * Renvoie les secondes restantes avant la prochaine rotation pour `params`
 * et `nowMs`. Permet d'animer un compte à rebours visuel.
 */
export function totpSecondsRemaining(params: TotpParams, nowMs: number = Date.now()): number {
  const period = params.period ?? 30
  const elapsed = Math.floor(nowMs / 1000) % period
  return period - elapsed
}

/**
 * Parse une URI `otpauth://totp/...` (format Google Authenticator KeyURI). Renvoie
 * les paramètres extraits, ou `null` si l'URI est invalide. **Tolérant** :
 *  - accepte `otpauth-migration://offline?...` ? non — on rejette explicitement
 *    (format différent, encodage protobuf), l'utilisateur doit ré-exporter.
 *  - URL-decode les segments `Issuer:account`.
 */
export function parseOtpauthUri(uri: string): ParsedOtpauth | null {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'otpauth:') return null
  const type = url.host.toLowerCase()
  if (type !== 'totp' && type !== 'hotp') return null

  const path = url.pathname.replace(/^\//, '')
  let issuer: string | undefined
  let accountName: string | undefined
  if (path.includes(':')) {
    const [iss, acc] = path.split(':', 2)
    issuer = decodeURIComponent(iss)
    accountName = decodeURIComponent(acc)
  } else {
    accountName = decodeURIComponent(path)
  }
  const params = url.searchParams
  const issuerParam = params.get('issuer')
  if (issuerParam) issuer = decodeURIComponent(issuerParam)

  const secret = params.get('secret')
  if (!secret) return null

  const algorithm = (params.get('algorithm') || 'SHA1').toUpperCase()
  const algMap: Record<string, TotpAlgorithm> = {
    SHA1: 'SHA-1',
    'SHA-1': 'SHA-1',
    SHA256: 'SHA-256',
    'SHA-256': 'SHA-256',
    SHA512: 'SHA-512',
    'SHA-512': 'SHA-512',
  }
  const alg: TotpAlgorithm = algMap[algorithm] ?? 'SHA-1'

  const digitsRaw = params.get('digits')
  const digits = digitsRaw ? Number.parseInt(digitsRaw, 10) : 6

  const periodRaw = params.get('period')
  const period = periodRaw ? Number.parseInt(periodRaw, 10) : 30

  const counterRaw = params.get('counter')
  const counter =
    type === 'hotp' && counterRaw ? Number.parseInt(counterRaw, 10) : undefined

  return {
    type: type as 'totp' | 'hotp',
    issuer,
    accountName,
    secret,
    period,
    digits,
    algorithm: alg,
    counter,
  }
}

// --- Internal HOTP -----------------------------------------------------

async function hotp(
  key: Uint8Array,
  counter: number,
  digits: number,
  algorithm: TotpAlgorithm
): Promise<string> {
  const counterBytes = new ArrayBuffer(8)
  const view = new DataView(counterBytes)
  // counter peut dépasser 2^32 ; on stocke en big-endian 64 bits.
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  view.setUint32(0, high, false)
  view.setUint32(4, low, false)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes)
  const sig = new Uint8Array(sigBuf)

  // Truncation RFC 4226 § 5.4 : prend le low-nibble du dernier byte comme offset.
  const offset = sig[sig.length - 1] & 0x0f
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)

  const mod = 10 ** digits
  return String(code % mod).padStart(digits, '0')
}

// --- Base32 (RFC 4648) -------------------------------------------------

const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Décode une chaîne base32 RFC 4648 vers un `Uint8Array`. Tolérant aux
 * espaces, minuscules et padding `=` (qui sont strippés).
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase()
  if (cleaned.length === 0) return new Uint8Array(0)
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of cleaned) {
    const idx = B32_ALPHA.indexOf(ch)
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${ch}`)
    }
    buffer = (buffer << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >>> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}
