/**
 * Copie clipboard avec **auto-clear** après N secondes.
 *
 * Limites volontaires (cf. PASS-CRYPTO § 6) :
 *  - On ne contrôle **pas** ce qui est colle ailleurs (autres apps, gestionnaires
 *    de clipboard tiers comme CopyQ). L'auto-clear protège uniquement le presse-
 *    papiers natif du navigateur.
 *  - Si l'utilisateur a copié quelque chose d'autre **après** notre copie, on ne
 *    l'écrase pas (on vérifie via `navigator.clipboard.readText()` quand le
 *    permission le permet).
 *  - Sur Firefox / Safari, `clipboard.readText()` exige un geste utilisateur ;
 *    dans ce cas on n'écrase rien et on log un warn — comportement Bitwarden /
 *    1Password équivalent.
 */

const DEFAULT_TTL_MS = 30_000

export interface CopyOptions {
  readonly ttlMs?: number
  /** Callback optionnel quand l'auto-clear a été appliqué (utile pour toasts). */
  readonly onCleared?: () => void
}

/**
 * Copie `text` dans le presse-papiers. Programme un effacement après `ttlMs`
 * **uniquement si** le contenu n'a pas été remplacé entre-temps.
 *
 * @returns une fonction `cancel()` qui annule l'auto-clear (rare, mais utile
 *          si l'utilisateur veut explicitement garder la valeur).
 */
export async function copyWithAutoClear(
  text: string,
  opts: CopyOptions = {}
): Promise<() => void> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  await navigator.clipboard.writeText(text)
  if (ttlMs <= 0) return () => {}
  let cancelled = false
  const timer = window.setTimeout(async () => {
    if (cancelled) return
    try {
      // Vérifie qu'on n'écrase pas un copier-coller ultérieur.
      const cur = await navigator.clipboard.readText()
      if (cur === text) {
        await navigator.clipboard.writeText('')
        opts.onCleared?.()
      }
    } catch {
      // Permission refusée (Firefox/Safari sans geste user) : on tente un
      // overwrite blind, c'est l'option la plus sûre du point de vue secret.
      try {
        await navigator.clipboard.writeText('')
        opts.onCleared?.()
      } catch {
        // tant pis — au moins on a essayé.
      }
    }
  }, ttlMs)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
  }
}
