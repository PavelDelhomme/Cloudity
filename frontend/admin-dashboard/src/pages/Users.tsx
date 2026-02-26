import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchUsers } from '../api'
import { PageLayout, Card, TableWrapper, TableHead, Th, TBody, Td, Badge } from '../components/PageLayout'

export default function Users() {
  const { accessToken, tenantId } = useAuth()

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

  return (
    <PageLayout
      title="Utilisateurs"
      description="Utilisateurs du tenant actuel"
    >
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
                  <Td className="font-medium text-slate-900">{u.email}</Td>
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
