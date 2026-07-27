export const PASS_AUTO_LOCK_STORAGE_KEY = 'cloudity.pass.autoLockMs.v1'

/** Délai par défaut (5 min) — aligné historique Pass web. */
export const DEFAULT_PASS_AUTO_LOCK_MS = 5 * 60 * 1000

/** @deprecated Préférer `getPassAutoLockAfterMs()` — conservé pour les tests. */
export const AUTO_LOCK_AFTER_MS = DEFAULT_PASS_AUTO_LOCK_MS

export type PassAutoLockOption = {
  label: string
  ms: number
}

export const PASS_AUTO_LOCK_OPTIONS: readonly PassAutoLockOption[] = [
  { label: '1 minute', ms: 60_000 },
  { label: '5 minutes', ms: 5 * 60_000 },
  { label: '15 minutes', ms: 15 * 60_000 },
  { label: '30 minutes', ms: 30 * 60_000 },
  { label: '1 heure', ms: 60 * 60_000 },
  { label: 'Jamais', ms: 0 },
] as const

export function getPassAutoLockAfterMs(): number {
  try {
    const cached = localStorage.getItem('cloudity.userPreferences.v1')
    if (cached) {
      const parsed = JSON.parse(cached) as { pass?: { autoLockMs?: number } }
      const ms = parsed.pass?.autoLockMs
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        if (ms === 0) return 0
        const allowed = PASS_AUTO_LOCK_OPTIONS.map((o) => o.ms).filter((m) => m > 0)
        return allowed.includes(ms) ? ms : DEFAULT_PASS_AUTO_LOCK_MS
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(PASS_AUTO_LOCK_STORAGE_KEY)
    if (raw == null) return DEFAULT_PASS_AUTO_LOCK_MS
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return DEFAULT_PASS_AUTO_LOCK_MS
    if (n === 0) return 0
    const allowed = PASS_AUTO_LOCK_OPTIONS.map((o) => o.ms).filter((m) => m > 0)
    return allowed.includes(n) ? n : DEFAULT_PASS_AUTO_LOCK_MS
  } catch {
    return DEFAULT_PASS_AUTO_LOCK_MS
  }
}

export function setPassAutoLockAfterMs(ms: number): void {
  const valid = PASS_AUTO_LOCK_OPTIONS.some((o) => o.ms === ms)
  if (!valid) return
  try {
    localStorage.setItem(PASS_AUTO_LOCK_STORAGE_KEY, String(ms))
  } catch {
    /* quota / private mode */
  }
}

export function formatPassAutoLockLabel(ms: number): string {
  const opt = PASS_AUTO_LOCK_OPTIONS.find((o) => o.ms === ms)
  if (opt) return opt.label
  if (ms <= 0) return 'Jamais'
  if (ms < 60_000) return `${Math.round(ms / 1000)} secondes`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minutes`
  return `${Math.round(ms / 3_600_000)} heure(s)`
}
