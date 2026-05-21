/**
 * Panneau Pass — enregistrement des alias mail côté Cloudity (même API que Mail).
 * L’alias doit exister côté fournisseur (MX / redirection) pour recevoir du courrier ;
 * ici on enregistre l’adresse pour filtres `delivered_to` et cohérence coffre / Mail.
 */

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button, Card, CardHeader, Input, Label } from '@cloudity/ui'
import { Mail } from 'lucide-react'
import {
  fetchMailAccounts,
  fetchMailAliases,
  fetchMailAliasConfig,
  createMailAlias,
  patchMailAlias,
  deleteMailAlias,
  type MailAccountResponse,
} from '../../../api'
import MailAliasDomainConfig from '../../../components/mail/MailAliasDomainConfig'
import {
  effectiveAliasHostSuffix,
  resolveAliasEmailInput,
  subscribeAliasSuffixChanges,
} from '../../../lib/mailAlias'

const selectClass =
  'block w-full rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-gray-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-500 sm:text-sm'

type Props = {
  accessToken: string
  logout: () => void
}

function accountLabel(a: MailAccountResponse): string {
  const lab = a.label?.trim()
  if (lab) return `${a.email} (${lab})`
  return a.email
}

export default function PassMailAliasesPanel({ accessToken, logout }: Props) {
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = React.useState<number | null>(null)
  const [newAliasEmail, setNewAliasEmail] = React.useState('')
  const [newAliasLabel, setNewAliasLabel] = React.useState('')
  const [newDeliverTarget, setNewDeliverTarget] = React.useState('')

  const accountsQuery = useQuery({
    queryKey: ['mail-accounts', 'pass-panel'],
    queryFn: () => fetchMailAccounts(accessToken),
    retry: false,
    staleTime: 60 * 1000,
    onError: (err: Error) => {
      if (err?.message?.includes('401')) {
        logout()
        toast.error('Session expirée. Reconnectez-vous.')
      }
    },
  })

  const accounts = accountsQuery.data ?? []

  React.useEffect(() => {
    if (accounts.length === 0) {
      setSelectedAccountId(null)
      return
    }
    if (selectedAccountId == null || !accounts.some((a) => a.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id)
    }
  }, [accounts, selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null

  const aliasConfigQuery = useQuery({
    queryKey: ['mail', 'alias-config', 'pass-panel'],
    queryFn: () => fetchMailAliasConfig(accessToken),
    staleTime: 5 * 60 * 1000,
  })

  const [aliasSuffixRevision, setAliasSuffixRevision] = React.useState(0)
  React.useEffect(() => subscribeAliasSuffixChanges(() => setAliasSuffixRevision((n) => n + 1)), [])

  const aliasHostSuffix = React.useMemo(
    () => effectiveAliasHostSuffix(aliasConfigQuery.data, selectedAccount?.email),
    [aliasConfigQuery.data, selectedAccount?.email, aliasSuffixRevision]
  )
  const aliasPreview = resolveAliasEmailInput(newAliasEmail, aliasHostSuffix)

  const aliasesQuery = useQuery({
    queryKey: ['mail-aliases', selectedAccountId],
    queryFn: () => fetchMailAliases(accessToken, selectedAccountId!),
    enabled: selectedAccountId != null,
    retry: false,
    staleTime: 30 * 1000,
    onError: (err: Error) => {
      if (err?.message?.includes('401')) {
        logout()
        toast.error('Session expirée. Reconnectez-vous.')
      }
    },
  })

  const createMutation = useMutation({
    mutationFn: () => {
      if (selectedAccountId == null) throw new Error('Choisir une boîte')
      const em = resolveAliasEmailInput(newAliasEmail, aliasHostSuffix)
      if (!em || !em.includes('@')) {
        throw new Error(
          aliasHostSuffix
            ? 'Indiquez un nom d’alias (ex. newsletter)'
            : 'Configurez le domaine alias ou saisissez une adresse complète'
        )
      }
      return createMailAlias(accessToken, selectedAccountId, {
        alias_email: em,
        label: newAliasLabel.trim() || undefined,
        deliver_target_email: newDeliverTarget.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-aliases', selectedAccountId] })
      setNewAliasEmail('')
      setNewAliasLabel('')
      setNewDeliverTarget('')
      toast.success('Alias enregistré (règle de tri créée si besoin)')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ aliasId, enabled }: { aliasId: number; enabled: boolean }) => {
      if (selectedAccountId == null) throw new Error('Choisir une boîte')
      return patchMailAlias(accessToken, selectedAccountId, aliasId, { enabled })
    },
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['mail-aliases', selectedAccountId] })
      toast.success(enabled ? 'Alias activé' : 'Alias désactivé')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ accountId, aliasId }: { accountId: number; aliasId: number }) =>
      deleteMailAlias(accessToken, accountId, aliasId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-aliases', selectedAccountId] })
      toast.success('Alias supprimé')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start gap-2">
            <Mail className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" aria-hidden />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Alias mail</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enregistrement côté Cloudity —{' '}
                <Link to="/app/mail" className="text-brand-600 dark:text-brand-400 underline">
                  Ouvrir Mail
                </Link>
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <div className="px-4 pb-4 space-y-4">
        {accountsQuery.isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Chargement des boîtes…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Aucune boîte mail reliée. Connecte une boîte dans{' '}
            <Link to="/app/mail" className="text-brand-600 dark:text-brand-400 underline">
              Mail
            </Link>{' '}
            pour ajouter des alias.
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="pass-alias-account">Boîte</Label>
              <select
                id="pass-alias-account"
                className={selectClass}
                value={selectedAccountId ?? ''}
                onChange={(e) => setSelectedAccountId(Number(e.target.value) || null)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
            </div>

            <MailAliasDomainConfig
              accessToken={accessToken}
              accountEmail={selectedAccount?.email}
              compact
            />

            <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-3 bg-slate-50/80 dark:bg-slate-800/40">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Nouvel alias</p>
              <div>
                <Label htmlFor="pass-alias-local">Nom de l’alias</Label>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <Input
                    id="pass-alias-local"
                    type="text"
                    autoComplete="off"
                    placeholder="newsletter"
                    value={newAliasEmail}
                    onChange={(e) => setNewAliasEmail(e.target.value)}
                    className="flex-1 min-w-[120px]"
                  />
                  {aliasHostSuffix ? (
                    <span className="text-sm text-slate-600 dark:text-slate-300 shrink-0">
                      @{aliasHostSuffix}
                    </span>
                  ) : null}
                </div>
                {aliasPreview && aliasPreview.includes('@') ? (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    → <span className="font-mono">{aliasPreview}</span>
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="pass-alias-label">Libellé (optionnel)</Label>
                <Input
                  id="pass-alias-label"
                  type="text"
                  placeholder="ex. Inscriptions"
                  value={newAliasLabel}
                  onChange={(e) => setNewAliasLabel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pass-alias-target">Boîte de réception (optionnel)</Label>
                <select
                  id="pass-alias-target"
                  className={selectClass}
                  value={newDeliverTarget}
                  onChange={(e) => setNewDeliverTarget(e.target.value)}
                >
                  <option value="">— Aucune (filtre Cloudity uniquement) —</option>
                  {accounts.map((a) => (
                    <option key={`deliver-${a.id}`} value={a.email}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Boîte IMAP qui reçoit le courrier redirigé vers cet alias.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={createMutation.isPending || !newAliasEmail.trim()}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer l’alias'}
              </Button>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Alias enregistrés ({aliasesQuery.data?.length ?? 0})
              </p>
              {aliasesQuery.isLoading ? (
                <p className="text-sm text-slate-500">Chargement…</p>
              ) : (aliasesQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Aucun alias pour cette boîte.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                  {aliasesQuery.data!.map((al) => (
                    <li
                      key={al.id}
                      className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white dark:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {al.alias_email}
                          {al.enabled === false ? (
                            <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">(désactivé)</span>
                          ) : null}
                        </div>
                        {(al.label || al.deliver_target_email) && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {al.label ? `${al.label}` : ''}
                            {al.label && al.deliver_target_email ? ' · ' : ''}
                            {al.deliver_target_email ?? ''}
                          </div>
                        )}
                      </div>
                      {selectedAccountId != null && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={toggleMutation.isPending}
                            onClick={() =>
                              toggleMutation.mutate({ aliasId: al.id, enabled: al.enabled === false })
                            }
                          >
                            {al.enabled === false ? 'Activer' : 'Désactiver'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 dark:text-red-400"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Retirer l’alias « ${al.alias_email} » de Cloudity ? (ne supprime pas l’adresse chez le fournisseur.)`
                                )
                              ) {
                                deleteMutation.mutate({ accountId: selectedAccountId, aliasId: al.id })
                              }
                            }}
                          >
                            Retirer
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
