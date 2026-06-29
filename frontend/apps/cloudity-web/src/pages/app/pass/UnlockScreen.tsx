import React, { useState } from 'react'
import { Button, Card, CardHeader, Input } from '@cloudity/ui'
import toast from 'react-hot-toast'
import { Lock, Loader2, Sparkles } from 'lucide-react'
import { useVault } from './vaultContext'
import { formatPassAutoLockLabel, getPassAutoLockAfterMs } from './passAutoLockSettings'

const MIN_MASTER_LEN = 8

interface Props {
  /** Identifiant de l'utilisateur courant (claim `user_id` du JWT). */
  userId: string | number
  /**
   * `setup` : aucun coffre côté serveur — l'utilisateur **choisit** un maître (première fois).
   * `unlock` : au moins un coffre existe — saisie du maître déjà utilisé pour chiffrer.
   */
  mode: 'setup' | 'unlock'
}

/**
 * Écran de déverrouillage du coffre Pass — saisie du **mot de passe maître**.
 *
 * Le mot de passe est dérivé via Argon2id côté client (~1 s sur desktop) ; rien
 * n'est envoyé au serveur. Si la saisie est mauvaise, on ne s'en rend compte
 * qu'au premier `decryptItemFromVault` (Poly1305 fail) — et c'est voulu : le
 * serveur ne peut pas vérifier le mot de passe maître par construction.
 */
export default function UnlockScreen({ userId, mode }: Props) {
  const { state, unlock } = useVault()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const submitting = state.status === 'unlocking'
  const autoLockMs = getPassAutoLockAfterMs()
  const autoLockHint =
    autoLockMs <= 0
      ? 'Auto-verrouillage désactivé pour cette session navigateur.'
      : `Auto-verrouillage après ${formatPassAutoLockLabel(autoLockMs).toLowerCase()} d'inactivité.`

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw) return
    if (mode === 'setup') {
      if (pw.length < MIN_MASTER_LEN) {
        toast.error(`Mot de passe maître : au moins ${MIN_MASTER_LEN} caractères.`)
        return
      }
      if (pw !== pw2) {
        toast.error('Les deux saisies ne correspondent pas.')
        return
      }
    }
    try {
      await unlock(pw, userId)
      toast.success(
        mode === 'setup'
          ? 'Coffre initialisé — mémorise ce mot de passe maître (Cloudity ne peut pas le réinitialiser).'
          : 'Coffre déverrouillé'
      )
      setPw('')
      setPw2('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      toast.error(`${mode === 'setup' ? 'Initialisation' : 'Déverrouillage'} : ${msg}`)
    }
  }

  const isSetup = mode === 'setup'

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            {isSetup ? (
              <Sparkles className="w-5 h-5 text-brand-500" aria-hidden />
            ) : (
              <Lock className="w-5 h-5 text-brand-500" aria-hidden />
            )}
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              {isSetup ? 'Initialiser le coffre Pass' : 'Coffre verrouillé'}
            </h2>
          </div>
        </CardHeader>
        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isSetup ? (
              <>
                Tu es déjà connecté avec ton <strong>compte Cloudity</strong> (étape
                d’authentification serveur). Ici, tu <strong>choisis</strong> un{' '}
                <strong>mot de passe maître</strong> uniquement pour chiffrer le
                coffre dans ton navigateur : Cloudity ne le reçoit ni ne le stocke. En
                démo locale, tu peux reprendre le <strong>même</strong> mot de passe
                que la connexion ; en usage réel, un maître <strong>distinct</strong>{' '}
                est recommandé — voir <strong>PASS-CRYPTO</strong> § 1.1.
              </>
            ) : (
              <>
                Entre le <strong>même</strong> mot de passe maître que celui avec lequel
                tu as chiffré tes entrées. Cloudity ne le stocke jamais. Si tu ne
                t’en souviens plus, aucune récupération côté serveur n’est possible
                (zero-access).
              </>
            )}
          </p>
          <Input
            type="password"
            placeholder="Mot de passe maître"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            autoFocus
            disabled={submitting}
            aria-label="Mot de passe maître"
          />
          {isSetup && (
            <Input
              type="password"
              placeholder="Confirmer le mot de passe maître"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
              aria-label="Confirmation du mot de passe maître"
            />
          )}
          <Button
            type="submit"
            disabled={
              submitting ||
              !pw ||
              (isSetup && (!pw2 || pw.length < MIN_MASTER_LEN || pw2.length < MIN_MASTER_LEN))
            }
            className="self-end"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {isSetup ? 'Initialisation…' : 'Déchiffrement…'}
              </span>
            ) : isSetup ? (
              'Initialiser et continuer'
            ) : (
              'Déverrouiller'
            )}
          </Button>
        </form>
        <div className="px-6 pb-6 text-xs text-slate-500 dark:text-slate-400">
          {autoLockHint}
          {isSetup && (
            <>
              {' '}
              Longueur minimale : {MIN_MASTER_LEN} caractères.
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
