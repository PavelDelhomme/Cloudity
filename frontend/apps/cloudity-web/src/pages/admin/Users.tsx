import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import {
  adminResetUser2FA,
  fetchTenantMailAccounts,
  fetchUsersPage,
  updateUser,
  type TenantMailAccountSummary,
  type UserResponse,
} from '../../api'
import { Badge, Button, Card, PageLayout, TBody, TableHead, TableWrapper, Td, Th } from '@cloudity/ui'
import { PaginationControls } from '../../components/PaginationControls'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const safeLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`
  const parts = domain.split('.')
  const safeDomain = parts.length >= 2 ? `${parts[0].slice(0, 2)}***.${parts.slice(1).join('.')}` : `${domain.slice(0, 2)}***`
  return `${safeLocal}@${safeDomain}`
}

function formatLastLogin(value: string | null): string {
  if (!value) return 'Jamais enregistrée'
  try {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return value
  }
}

function isDemoLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@cloudity.local')
}

function mailAccountsForUser(
  userId: number,
  byUser: Map<number, TenantMailAccountSummary[]>
): TenantMailAccountSummary[] {
  return byUser.get(userId) ?? []
}

function detectLoginEmailIssue(
  user: UserResponse,
  allMail: TenantMailAccountSummary[]
): string | null {
  const login = user.email.trim().toLowerCase()
  const owner = allMail.find((m) => m.email.trim().toLowerCase() === login)
  if (owner && owner.user_id !== user.id) {
    return `Cet email de connexion est aussi une boîte mail du user #${owner.user_id} — compte probablement créé par erreur (alias/boîte, pas un login).`
  }
  const linked = allMail.filter((m) => m.user_id === user.id)
  if (linked.length > 0 && !linked.some((m) => m.email.trim().toLowerCase() === login)) {
    return 'Le login ne correspond à aucune boîte liée — normal si login principal ≠ boîtes gérées (ex. paul@… + candidatures@…).'
  }
  return null
}

export default function Users() {
  const { accessToken, tenantId } = useAuth()
  const queryClient = useQueryClient()
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editingEmail, setEditingEmail] = useState('')
  const [showEmails, setShowEmails] = useState(false)
  const [hideDemoUsers, setHideDemoUsers] = useState(true)
  const [page, setPage] = useState(0)
  const pageSize = 25
  const [resetUserId, setResetUserId] = useState<number | null>(null)
  const [resetTotp, setResetTotp] = useState('')
  const [resetReason, setResetReason] = useState('')

  useEffect(() => {
    setPage(0)
  }, [tenantId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', tenantId ?? 0, page, pageSize],
    queryFn: () =>
      fetchUsersPage(tenantId!, accessToken!, { skip: page * pageSize, pageSize }),
    enabled: Boolean(accessToken && tenantId != null),
  })

  const { data: mailAccounts = [] } = useQuery({
    queryKey: ['admin-mail-accounts', tenantId ?? 0],
    queryFn: () => fetchTenantMailAccounts(tenantId!, accessToken!),
    enabled: Boolean(accessToken && tenantId != null),
  })

  const mailByUser = useMemo(() => {
    const map = new Map<number, TenantMailAccountSummary[]>()
    for (const m of mailAccounts) {
      const list = map.get(m.user_id) ?? []
      list.push(m)
      map.set(m.user_id, list)
    }
    return map
  }, [mailAccounts])

  const reset2FAMutation = useMutation({
    mutationFn: (payload: { userId: number; admin_totp_code: string; reason?: string }) =>
      adminResetUser2FA(payload.userId, { admin_totp_code: payload.admin_totp_code, reason: payload.reason }, accessToken!),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['users', tenantId ?? 0] })
      setResetUserId(null)
      setResetTotp('')
      setResetReason('')
      toast.success(res.message)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Échec du reset 2FA'),
  })

  const updateUserMutation = useMutation({
    mutationFn: (payload: { userId: number; patch: { email?: string; is_active?: boolean } }) =>
      updateUser(payload.userId, payload.patch, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', tenantId ?? 0] })
      setEditingUserId(null)
      setEditingEmail('')
      toast.success('Utilisateur mis à jour')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur de mise à jour'),
  })

  if (tenantId == null || !accessToken) {
    return (
      <PageLayout title="Utilisateurs">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Utilisateurs">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Utilisateurs">
        <p className="text-red-600">{error instanceof Error ? error.message : 'Erreur'}</p>
      </PageLayout>
    )
  }

  const rawList = data?.items ?? []
  const list = hideDemoUsers ? rawList.filter((u) => !isDemoLoginEmail(u.email)) : rawList
  const hasMore = data?.hasMore ?? false
  const canPrev = page > 0
  const canNext = hasMore

  return (
    <PageLayout
      title="Utilisateurs"
      description="Comptes de connexion Cloudity (table users) — distincts des boîtes mail liées dans l’app Mail."
    >
      <Card className="p-4 mb-4 border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Login vs boîtes mail</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Un utilisateur ici possède un mot de passe Cloudity et peut se connecter. Les adresses comme{' '}
          <span className="font-mono text-xs">candidatures@…</span> dans Mail sont des{' '}
          <strong>boîtes liées</strong> (IMAP) — elles ne doivent pas apparaître ici sauf si quelqu’un a créé un compte
          de connexion avec cette adresse par erreur. Les comptes <span className="font-mono text-xs">@cloudity.local</span>{' '}
          sont des seeds/démo.
        </p>
      </Card>

      <Card className="p-4 mb-4 border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Réinitialisation 2FA (U9)</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Désactive TOTP et supprime les codes de récupération d’un utilisateur bloqué. Requiert votre code 2FA admin (step-up),
          journalise l’action dans <span className="font-mono">audit_logs</span> et refuse le dernier admin 2FA du tenant.
        </p>
      </Card>

      {resetUserId != null ? (
        <Card className="p-4 mb-4 border-amber-300 dark:border-amber-700">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Confirmer la réinitialisation 2FA — utilisateur #{resetUserId}
          </p>
          <div className="mt-3 flex flex-col gap-3 max-w-md">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Votre code TOTP admin
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={resetTotp}
                onChange={(e) => setResetTotp(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="123456"
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Motif (optionnel)
              <input
                type="text"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Authenticator perdu, ticket support…"
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={reset2FAMutation.isPending || resetTotp.trim().length < 6}
                onClick={() =>
                  reset2FAMutation.mutate({
                    userId: resetUserId,
                    admin_totp_code: resetTotp.trim(),
                    reason: resetReason.trim() || undefined,
                  })
                }
              >
                Réinitialiser la 2FA
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setResetUserId(null)
                  setResetTotp('')
                  setResetReason('')
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowEmails((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {showEmails ? 'Masquer les e-mails' : 'Afficher les e-mails'}
        </button>
        <button
          type="button"
          onClick={() => setHideDemoUsers((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {hideDemoUsers ? 'Afficher comptes @cloudity.local' : 'Masquer comptes démo'}
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {mailAccounts.length} boîte(s) mail liée(s) sur ce tenant · colonne « Boîtes liées » = IMAP, pas login.
        </span>
      </div>
      <Card>
        <TableWrapper>
          <TableHead>
            <Th>Email (login)</Th>
            <Th>Boîtes mail liées</Th>
            <Th>Rôle</Th>
            <Th>2FA</Th>
            <Th>Actif</Th>
            <Th>Dernière connexion</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                  Aucun utilisateur pour ce tenant{hideDemoUsers ? ' (filtre démo actif)' : ''}.
                </td>
              </tr>
            ) : (
              list.map((u) => {
                const linked = mailAccountsForUser(u.id, mailByUser)
                const issue = detectLoginEmailIssue(u, mailAccounts)
                return (
                  <tr key={u.id}>
                    <Td className="font-medium text-slate-900 align-top">
                      {editingUserId === u.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            placeholder="nouvel-email@exemple.com"
                          />
                          <button
                            type="button"
                            onClick={() => updateUserMutation.mutate({ userId: u.id, patch: { email: editingEmail.trim().toLowerCase() } })}
                            disabled={updateUserMutation.isPending || !editingEmail.trim()}
                            className="rounded-md bg-brand-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(null)
                              setEditingEmail('')
                            }}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{showEmails ? u.email : maskEmail(u.email)}</span>
                            {isDemoLoginEmail(u.email) ? (
                              <Badge variant="default">démo</Badge>
                            ) : null}
                            <span className="text-xs text-slate-400">#{u.id}</span>
                          </div>
                          {issue ? (
                            <p className="text-xs text-amber-800 dark:text-amber-200 max-w-md leading-snug">{issue}</p>
                          ) : null}
                        </div>
                      )}
                    </Td>
                    <Td className="align-top text-sm text-slate-600 dark:text-slate-300 max-w-xs">
                      {linked.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {linked.map((m) => (
                            <li key={m.id} className="leading-snug">
                              <span className="font-mono text-xs break-all">{showEmails ? m.email : maskEmail(m.email)}</span>
                              {m.label ? (
                                <span className="text-slate-500 dark:text-slate-400"> · {m.label}</span>
                              ) : null}
                              {m.alias_count > 0 ? (
                                <span className="text-slate-500 dark:text-slate-400"> · {m.alias_count} alias</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td className="text-slate-600">{u.role}</Td>
                    <Td>
                      <Badge variant={u.is_2fa_enabled ? 'success' : 'default'}>
                        {u.is_2fa_enabled ? 'Oui' : 'Non'}
                      </Badge>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="inline-flex"
                        onClick={() => updateUserMutation.mutate({ userId: u.id, patch: { is_active: !u.is_active } })}
                        disabled={updateUserMutation.isPending}
                        title={u.is_active ? 'Suspendre ce compte' : 'Réactiver ce compte'}
                      >
                        <Badge variant={u.is_active ? 'success' : 'error'}>
                          {u.is_active ? 'Oui' : 'Non'}
                        </Badge>
                      </button>
                    </Td>
                    <Td className="text-slate-500 whitespace-nowrap align-top">
                      {formatLastLogin(u.last_login)}
                    </Td>
                    <Td className="text-right space-x-1 align-top">
                      {u.is_2fa_enabled ? (
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs text-amber-800 dark:text-amber-200"
                          onClick={() => {
                            setResetUserId(u.id)
                            setResetTotp('')
                            setResetReason('')
                          }}
                        >
                          Reset 2FA
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => {
                          setEditingUserId(u.id)
                          setEditingEmail(u.email)
                        }}
                      >
                        Modifier email
                      </Button>
                    </Td>
                  </tr>
                )
              })
            )}
          </TBody>
        </TableWrapper>
        <PaginationControls
          page={page}
          canPrev={canPrev}
          canNext={canNext}
          rangeLabel={
            list.length === 0 ? 'Aucune ligne' : `Lignes ${page * pageSize + 1}–${page * pageSize + list.length}`
          }
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </Card>
    </PageLayout>
  )
}
