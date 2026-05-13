import React, { useState } from 'react'
import { Card, CardHeader, Button, Input } from '@cloudity/shared'
import toast from 'react-hot-toast'
import { Lock, Loader2 } from 'lucide-react'
import { useVault } from './vaultContext'

interface Props {
  /** Identifiant de l'utilisateur courant (claim `user_id` du JWT). */
  userId: string | number
}

/**
 * Écran de déverrouillage du coffre Pass — saisie du **mot de passe maître**.
 *
 * Le mot de passe est dérivé via Argon2id côté client (~1 s sur desktop) ; rien
 * n'est envoyé au serveur. Si la saisie est mauvaise, on ne s'en rend compte
 * qu'au premier `decryptItemFromVault` (Poly1305 fail) — et c'est voulu : le
 * serveur ne peut pas vérifier le mot de passe maître par construction.
 */
export default function UnlockScreen({ userId }: Props) {
  const { state, unlock } = useVault()
  const [pw, setPw] = useState('')
  const submitting = state.status === 'unlocking'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw) return
    try {
      await unlock(pw, userId)
      toast.success('Coffre déverrouillé')
      setPw('') // efface la valeur du state React (le DOM input est aussi vidé)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      toast.error(`Déverrouillage : ${msg}`)
    }
  }

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-brand-500" aria-hidden />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Coffre verrouillé
            </h2>
          </div>
        </CardHeader>
        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Entre ton <strong>mot de passe maître</strong> pour déchiffrer tes
            entrées. Cloudity ne le stocke jamais — il sert uniquement à dériver
            la clé de chiffrement côté navigateur.
          </p>
          <Input
            type="password"
            placeholder="Mot de passe maître"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            autoFocus
            disabled={submitting}
            aria-label="Mot de passe maître"
          />
          <Button type="submit" disabled={submitting || !pw} className="self-end">
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                Déchiffrement…
              </span>
            ) : (
              'Déverrouiller'
            )}
          </Button>
        </form>
        <div className="px-6 pb-6 text-xs text-slate-500 dark:text-slate-400">
          Auto-verrouillage après 5 minutes d'inactivité.
        </div>
      </Card>
    </div>
  )
}
