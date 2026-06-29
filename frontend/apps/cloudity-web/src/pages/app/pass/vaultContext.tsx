/**
 * vaultContext.tsx — état du coffre Pass déverrouillé.
 *
 * Garanties sécurité (cf. docs/securite/PASS-CRYPTO.md § 1 / § 3) :
 *  - La **master key** (32 octets) ne quitte **jamais** la mémoire de l'app.
 *    Elle vit dans un `useState` React — pas de `localStorage`, pas de
 *    `sessionStorage`, pas de cookie. Un XSS qui s'exécute peut tenter de la
 *    lire en mémoire, mais elle disparaît dès qu'on lock ou qu'on rafraîchit.
 *  - **Auto-lock** : après le délai configuré (Paramètres → Sécurité Pass),
 *    on efface la MK avec `.fill(0)`. Aucune persistance entre onglets.
 *  - **Salt utilisateur** : dérivé du `user_id` côté client pour le PoC v0.1
 *    (suffisant car un salt n'est pas un secret — il sert juste à empêcher
 *    les rainbow tables et reste stable par utilisateur). Migration future
 *    vers un salt stocké côté serveur (`users.pass_salt`) pour multi-device
 *    (cf. PASS-CRYPTO § 5).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ARGON2ID_PROFILES,
  deriveMasterKey,
  type Argon2idProfile,
  type KdfDescriptor,
} from '@cloudity/pass-crypto'
import { getPassAutoLockAfterMs, DEFAULT_PASS_AUTO_LOCK_MS } from './passAutoLockSettings'

// --- Constantes --------------------------------------------------------

/** Délai par défaut (ms) — voir Paramètres → Sécurité Pass. */
export { DEFAULT_PASS_AUTO_LOCK_MS as AUTO_LOCK_AFTER_MS }

/** Préfixe stable du salt utilisateur côté client (PoC v0.1). */
const USER_SALT_PREFIX = 'cloudity-pass:v1:user-salt:'

/** Profil Argon2id par défaut côté navigateur (mid-laptop ~900-1000 ms). */
const DEFAULT_PROFILE: Argon2idProfile = 'desktop'

// --- Helpers -----------------------------------------------------------

/**
 * Salt utilisateur 16 octets dérivé du couple (user_id, USER_SALT_PREFIX) via
 * SHA-256. Stable par utilisateur, public (un salt n'a pas besoin d'être secret).
 *
 * Note : on n'utilise pas HKDF ici parce qu'on n'a pas encore de master key — on
 * a juste besoin d'un identifiant déterministe. SHA-256 du préfixe + user_id
 * suffit pour distribuer uniformément les salts.
 */
async function deriveUserSalt(userId: string | number): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const input = enc.encode(USER_SALT_PREFIX + String(userId))
  const buf = await crypto.subtle.digest('SHA-256', input)
  return new Uint8Array(buf, 0, 16) // 16 octets = recommandé Argon2id
}

/** Construit le KDF descriptor inscrit dans `EnvelopeV1.kdf`. */
function kdfDescriptor(profile: Argon2idProfile): KdfDescriptor {
  const p = ARGON2ID_PROFILES[profile]
  return { name: 'argon2id', t: p.t, m: p.m, p: p.p }
}

// --- Types -------------------------------------------------------------

export type VaultLockState =
  | { status: 'locked' }
  | { status: 'unlocking' }
  | {
      status: 'unlocked'
      masterKey: Uint8Array
      saltUser: Uint8Array
      kdf: KdfDescriptor
      profile: Argon2idProfile
      unlockedAt: number
    }

export interface VaultContextValue {
  state: VaultLockState
  /** Tente de déverrouiller le coffre avec le mot de passe maître + l'identifiant user. */
  unlock: (masterPassword: string, userId: string | number) => Promise<void>
  /** Verrouille le coffre (efface la master key). */
  lock: () => void
  /** Notifie une activité utilisateur (reset du timer d'auto-lock). */
  bumpActivity: () => void
}

// --- Context -----------------------------------------------------------

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<VaultLockState>({ status: 'locked' })
  const lastActivityRef = useRef<number>(Date.now())
  const lockTimerRef = useRef<number | null>(null)

  /** Efface la master key de la RAM en zeroïsant le buffer. */
  const lock = useCallback(() => {
    setState((cur) => {
      if (cur.status === 'unlocked') {
        cur.masterKey.fill(0)
      }
      return { status: 'locked' }
    })
    if (lockTimerRef.current != null) {
      window.clearTimeout(lockTimerRef.current)
      lockTimerRef.current = null
    }
  }, [])

  const unlock = useCallback(
    async (masterPassword: string, userId: string | number) => {
      setState({ status: 'unlocking' })
      const saltUser = await deriveUserSalt(userId)
      const profile = DEFAULT_PROFILE
      const masterKey = await deriveMasterKey({
        password: masterPassword,
        salt: saltUser,
        params: ARGON2ID_PROFILES[profile],
      })
      lastActivityRef.current = Date.now()
      setState({
        status: 'unlocked',
        masterKey,
        saltUser,
        kdf: kdfDescriptor(profile),
        profile,
        unlockedAt: Date.now(),
      })
    },
    []
  )

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Auto-lock loop : toutes les 30 s, regarde si l'inactivité dépasse le seuil.
  useEffect(() => {
    if (state.status !== 'unlocked') return
    const id = window.setInterval(() => {
      const threshold = getPassAutoLockAfterMs()
      if (threshold <= 0) return
      const idle = Date.now() - lastActivityRef.current
      if (idle >= threshold) {
        lock()
      }
    }, 30_000)
    return () => window.clearInterval(id)
  }, [state.status, lock])

  // Hook DOM : tout clic / focus / touche dans la fenêtre relance le compteur.
  useEffect(() => {
    if (state.status !== 'unlocked') return
    const onActivity = () => bumpActivity()
    window.addEventListener('keydown', onActivity, { passive: true })
    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })
    return () => {
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('touchstart', onActivity)
    }
  }, [state.status, bumpActivity])

  // Cleanup au démontage : on efface la MK même si le composant est unmount.
  useEffect(
    () => () => {
      setState((cur) => {
        if (cur.status === 'unlocked') {
          cur.masterKey.fill(0)
        }
        return cur
      })
    },
    []
  )

  const value = useMemo<VaultContextValue>(
    () => ({ state, unlock, lock, bumpActivity }),
    [state, unlock, lock, bumpActivity]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) {
    throw new Error('useVault doit être appelé sous <VaultProvider>')
  }
  return ctx
}

/** Renvoie la master key uniquement si déverrouillée — lance sinon. */
export function useUnlockedVault(): Extract<VaultLockState, { status: 'unlocked' }> {
  const { state } = useVault()
  if (state.status !== 'unlocked') {
    throw new Error('Vault locked — déverrouille d\'abord avec useVault().unlock()')
  }
  return state
}
