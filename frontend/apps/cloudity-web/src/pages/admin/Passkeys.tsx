import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Key, Trash2, Plus } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Input, PageLayout } from '@cloudity/ui'
import { useAuth } from '../../authContext'
import {
  deletePasskey,
  isWebAuthnSupported,
  listPasskeys,
  registerPasskey,
  type PasskeyView,
} from '../../webauthn'

const formatDate = (iso?: string) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const passkeyQuota = 5

function passkeyName(p: PasskeyView, index: number): string {
  return p.nickname?.trim() || `Passkey ${index + 1}`
}

function transportLabel(value: string): string {
  if (value === 'internal') return 'appareil local'
  if (value === 'usb') return 'clé USB/NFC'
  if (value === 'ble') return 'Bluetooth'
  if (value === 'hybrid') return 'téléphone / cloud sync'
  return value
}

export default function Passkeys() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  const [nickname, setNickname] = useState('')

  const { data: passkeys, isLoading, error } = useQuery({
    queryKey: ['webauthn-credentials'],
    queryFn: () => listPasskeys(accessToken!),
    enabled: Boolean(accessToken),
  })

  const enrollMutation = useMutation({
    mutationFn: () => registerPasskey(accessToken!, nickname || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webauthn-credentials'] })
      setNickname('')
      toast.success('Passkey enregistrée')
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePasskey(accessToken!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webauthn-credentials'] })
      toast.success('Passkey supprimée')
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  })

  if (!accessToken) {
    return (
      <PageLayout title="Passkeys / WebAuthn">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  const supported = isWebAuthnSupported()
  const passkeyCount = passkeys?.length ?? 0
  const quotaReached = passkeyCount >= passkeyQuota

  return (
    <PageLayout
      title="Passkeys / WebAuthn"
      description="Phase W1 — passkeys phishing-resistant pour les comptes /4dm1n. Voir docs/securite/WEBAUTHN-PLAN.md."
    >
      <Card className="max-w-3xl border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20">
        <div className="p-4 text-sm text-blue-950 dark:text-blue-100">
          <p className="font-semibold">Ce que cette page couvre aujourd’hui</p>
          <p className="mt-1">
            Les passkeys sont déjà utiles pour le web : inscription, login discoverable et suppression. L’extension Pass et les apps
            mobiles devront brancher leurs APIs natives dans une phase dédiée.
          </p>
        </div>
      </Card>

      <Card className="max-w-3xl mt-6">
        <CardHeader
          title="Ajouter une passkey"
          subtitle={`Une passkey peut être une clé YubiKey/Titan, Touch ID, Windows Hello ou un téléphone. Quota : ${passkeyCount}/${passkeyQuota}.`}
        />
        <div className="p-6 space-y-4">
          {!supported && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Ce navigateur ne supporte pas WebAuthn. Utiliser une version récente de Chrome/Firefox/Safari/Edge.
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="passkey-nickname" className="block text-sm text-slate-600 mb-1">
                Surnom (optionnel)
              </label>
              <Input
                id="passkey-nickname"
                placeholder="Ex. YubiKey perso, MacBook Touch ID…"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={!supported || enrollMutation.isPending}
              />
            </div>
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={!supported || enrollMutation.isPending || quotaReached}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {quotaReached ? 'Quota atteint' : enrollMutation.isPending ? 'Enregistrement…' : 'Ajouter une passkey'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="max-w-3xl mt-6">
        <CardHeader
          title="Passkeys enregistrées"
          subtitle={passkeys ? `${passkeyCount}/${passkeyQuota} clé(s)` : '—'}
        />
        <div className="p-6">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Chargement…
            </div>
          )}
          {error && (
            <p className="text-red-600 text-sm">Erreur : {(error as Error).message}</p>
          )}
          {passkeys && passkeys.length === 0 && (
            <p className="text-slate-500 text-sm">Aucune passkey enregistrée. Utiliser le bouton ci-dessus pour en ajouter une.</p>
          )}
          {passkeys && passkeys.length > 0 && (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {passkeys.map((p: PasskeyView, index) => {
                const displayName = passkeyName(p, index)
                const transports = p.transports ?? []
                return (
                  <li key={p.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Key className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{displayName}</div>
                        <div className="text-slate-500 text-xs">
                          Ajoutée {formatDate(p.created_at)}
                          {p.last_used_at && <> · dernière utilisation {formatDate(p.last_used_at)}</>}
                          {' '}· attestation {p.attestation_fmt || 'none'}
                          {p.backup_eligible ? ' · synchronisable' : ' · non synchronisable'}
                        </div>
                        {transports.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transports.map((t) => (
                              <Badge key={t}>{transportLabel(t)}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Supprimer la passkey "${displayName}" ?`)) {
                          deleteMutation.mutate(p.id)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      aria-label={`Supprimer ${displayName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </PageLayout>
  )
}
