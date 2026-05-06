import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchTenants } from '../api'
import { PageLayout, Card, TableWrapper, TableHead, Th, TBody, Td, Badge, Button } from '../components/PageLayout'
import { PaginationControls } from '../components/PaginationControls'

export default function Tenants() {
  const { accessToken } = useAuth()
  const [page, setPage] = React.useState(0)
  const pageSize = 20

  const { data: tenants, isLoading, error } = useQuery({
    queryKey: ['tenants', page, pageSize],
    queryFn: () => fetchTenants(accessToken!, { skip: page * pageSize, limit: pageSize }),
    enabled: Boolean(accessToken),
  })

  if (!accessToken) {
    return (
      <PageLayout title="Tenants">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Tenants">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Tenants">
        <p className="text-red-600">{error instanceof Error ? error.message : 'Erreur'}</p>
      </PageLayout>
    )
  }

  const list = tenants ?? []
  const canPrev = page > 0
  const canNext = list.length >= pageSize

  return (
    <PageLayout
      title="Tenants"
      description="Gérer les organisations et domaines"
      action={<Button>Créer un tenant</Button>}
    >
      <Card>
        <TableWrapper>
          <TableHead>
            <Th>Nom</Th>
            <Th>Domaine</Th>
            <Th>Statut</Th>
            <Th>Actions</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  Aucun tenant.
                </td>
              </tr>
            ) : (
              list.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium text-slate-900">{t.name}</Td>
                  <Td className="text-slate-600">{t.domain}</Td>
                  <Td>
                    <Badge variant={t.is_active ? 'success' : 'default'}>
                      {t.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" className="!px-2 !py-1 text-xs">Modifier</Button>
                      <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600 hover:bg-red-50">Supprimer</Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </TBody>
        </TableWrapper>
        <PaginationControls
          page={page}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </Card>
    </PageLayout>
  )
}
