// TwoFactorSection — activation TOTP compte Cloudity (Settings utilisateur).
//
// Flux : POST /auth/2fa/enable (secret + otpauth) → saisie du 1er code TOTP
// → POST /auth/2fa/verify (active is_2fa_enabled + génère 10 codes de récup).

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ShieldCheck, Copy, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, Button, Input } from '@cloudity/shared'
import { useAuth } from '../../../authContext'
import { enable2FA, verify2FA, countRecoveryCodes } from '../../../api'
import { generateTotp } from '../pass/totp'

type SetupPhase = 'idle' | 'pending_verify' | 'enabled'

export default function TwoFactorSection() {
  const { accessToken, email } = useAuth()
  const qc = useQueryClient()
  const [phase, setPhase] = useState<SetupPhase>('idle')
  const [secret, setSecret] = useState('')
  const [otpauthUrl, setOtpauthUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(null)

  const { data: recoveryCount, isLoading: countLoading } = useQuery({
    queryKey: ['recovery-codes-count'],
    queryFn: () => countRecoveryCodes(accessToken!),
    enabled: Boolean(accessToken),
  })

  const activeRecovery = recoveryCount?.active ?? 0
  const isEnabled = activeRecovery > 0 || phase === 'enabled'

  const enableMutation = useMutation({
    mutationFn: () => enable2FA(accessToken!),
    onSuccess: (res) => {
      setSecret(res.secret)
      setOtpauthUrl(res.url)
      setPhase('pending_verify')
      setVerifyCode('')
      toast.success('Scanne le QR ou saisis le secret, puis entre le code à 6 chiffres.')
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  })

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!email?.trim()) throw new Error('Email de session manquant')
      return verify2FA({ email: email.trim(), code: verifyCode.trim() })
    },
    onSuccess: (res) => {
      setPhase('enabled')
      setSecret('')
      setOtpauthUrl('')
      setVerifyCode('')
      if (res.recovery_codes?.length) {
        setFreshRecoveryCodes(res.recovery_codes)
      }
      qc.invalidateQueries({ queryKey: ['recovery-codes-count'] })
      toast.success('2FA activée')
    },
    onError: (err: Error) => toast.error(`Code invalide : ${err.message}`),
  })

  const onCopySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      toast.success('Secret copié')
    } catch {
      toast.error('Copie impossible — sélectionne le secret manuellement.')
    }
  }

  const onFillCurrentTotp = async () => {
    if (!secret) return
    try {
      const code = await generateTotp({ secret })
      setVerifyCode(code)
    } catch {
      toast.error('Secret TOTP invalide')
    }
  }

  if (!accessToken) return null

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Authentification à 2 facteurs (TOTP)"
        subtitle="Google Authenticator, 1Password, Authy, Proton Pass… — obligatoire à chaque connexion une fois activée."
      />
      <div className="p-6 space-y-4">
        {isEnabled && phase !== 'pending_verify' && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="w-5 h-5" />
            <span>
              <strong>2FA activée</strong>
              {countLoading ? '' : ` — ${activeRecovery} code${activeRecovery > 1 ? 's' : ''} de récupération disponible${activeRecovery > 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {!isEnabled && phase === 'idle' && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Protège ton compte avec un code à 6 chiffres en plus du mot de passe. Tu recevras 10 codes de
              récupération à sauvegarder immédiatement.
            </p>
            <Button
              onClick={() => enableMutation.mutate()}
              disabled={enableMutation.isPending}
              className="flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {enableMutation.isPending ? 'Préparation…' : 'Activer la 2FA'}
            </Button>
          </>
        )}

        {phase === 'pending_verify' && secret && (
          <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-600 p-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Ajoute ce compte dans ton authenticator, puis saisis le code à 6 chiffres pour confirmer.
            </p>
            {otpauthUrl && (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`}
                  alt="QR code TOTP"
                  width={180}
                  height={180}
                  className="rounded border border-slate-200 dark:border-slate-600 bg-white"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Secret (saisie manuelle)</p>
                  <code
                    data-testid="twofa-setup-secret"
                    className="block text-sm font-mono break-all text-slate-900 dark:text-slate-100 select-all"
                  >
                    {secret}
                  </code>
                  <Button variant="ghost" onClick={onCopySecret} className="flex items-center gap-2 text-sm">
                    <Copy className="w-4 h-4" /> Copier le secret
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label htmlFor="twofa-setup-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Code de vérification (6 chiffres)
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="twofa-setup-code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="font-mono max-w-[12rem]"
                />
                <Button variant="ghost" type="button" onClick={onFillCurrentTotp} className="text-sm">
                  Remplir le code actuel (dev)
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending || verifyCode.trim().length < 6}
              >
                {verifyMutation.isPending ? 'Vérification…' : 'Confirmer et activer'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase('idle')
                  setSecret('')
                  setOtpauthUrl('')
                  setVerifyCode('')
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        {freshRecoveryCodes && freshRecoveryCodes.length > 0 && (
          <div className="rounded-md border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>Sauvegarde ces codes MAINTENANT</strong> — ils ne réapparaîtront pas.
              </p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-sm">
              {freshRecoveryCodes.map((c, i) => (
                <li key={i} className="select-all">
                  {c}
                </li>
              ))}
            </ul>
            <Button className="mt-3" variant="ghost" onClick={() => setFreshRecoveryCodes(null)}>
              J&apos;ai sauvegardé — masquer
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
