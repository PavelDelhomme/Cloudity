import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuth } from '../authContext'
import { fetchUsers, updateUser } from '../api'
import { PageLayout, Card, TableWrapper, TableHead, Th, TBody, Td, Badge } from '../components/PageLayout'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const safeLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`
  const parts = domain.split('.')
  const safeDomain = parts.length >= 2 ? `${parts[0].slice(0, 2)}***.${parts.slice(1).join('.')}` : `${domain.slice(0, 2)}***`
  return `${safeLocal}@${safeDomain}`
}

export default function Users() {
  const { accessToken, tenantId } = useAuth()
  const queryClient = useQueryClient()
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editingEmail, setEditingEmail] = useState('')
  const [showEmails, setShowEmails] = useState(false)

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users', tenantId ?? 0],
    queryFn: () => fetchUsers(tenantId!, accessToken!),
    enabled: Boolean(accessToken && tenantId != null),
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

  const list = users ?? []
  const updateUserMutation = useMutation({
    mutationFn: (payload: { userId: number; email: string }) => updateUser(payload.userId, { email: payload.email }, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', tenantId ?? 0] })
      setEditingUserId(null)
      setEditingEmail('')
      toast.success('Adresse de connexion mise à jour')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur de mise à jour'),
  })

  return (
    <PageLayout
      title="Utilisateurs"
      description="Utilisateurs du tenant actuel (adresse de connexion modifiable)"
    >
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setShowEmails((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {showEmails ? 'Masquer les e-mails' : 'Afficher les e-mails'}
        </button>
      </div>
      <Card>
        <TableWrapper>
          <TableHead>
            <Th>Email</Th>
            <Th>Rôle</Th>
            <Th>2FA</Th>
            <Th>Actif</Th>
            <Th>Dernière connexion</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  Aucun utilisateur pour ce tenant.
                </td>
              </tr>
            ) : (
              list.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-slate-900">
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
                          onClick={() => updateUserMutation.mutate({ userId: u.id, email: editingEmail.trim().toLowerCase() })}
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
                      <div className="flex items-center gap-2">
                        <span>{showEmails ? u.email : maskEmail(u.email)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(u.id)
                            setEditingEmail(u.email)
                          }}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                        >
                          Changer
                        </button>
                      </div>
                    )}
                  </Td>
                  <Td className="text-slate-600">{u.role}</Td>
                  <Td>
                    <Badge variant={u.is_2fa_enabled ? 'success' : 'default'}>
                      {u.is_2fa_enabled ? 'Oui' : 'Non'}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={u.is_active ? 'success' : 'error'}>
                      {u.is_active ? 'Oui' : 'Non'}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500 whitespace-nowrap">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                  </Td>
                </tr>
              ))
            )}
          </TBody>
        </TableWrapper>
      </Card>
    </PageLayout>
  )
}
