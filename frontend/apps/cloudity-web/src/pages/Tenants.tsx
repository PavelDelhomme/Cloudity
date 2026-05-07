import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuth } from '../authContext'
import { deleteTenant, fetchTenantsPage } from '../api'
import { PageLayout, Card, TableWrapper, TableHead, Th, TBody, Td, Badge, Button, Input } from '@cloudity/shared'
import { PaginationControls } from '../components/PaginationControls'

const DEFAULT_TENANT_ID = 1

export default function Tenants() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = React.useState(0)
  const pageSize = 20
  const [domainDraft, setDomainDraft] = React.useState('e2e-')
  const [domainFilter, setDomainFilter] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set())
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['tenants', page, pageSize, domainFilter],
    queryFn: () =>
      fetchTenantsPage(accessToken!, {
        skip: page * pageSize,
        pageSize,
        domainContains: domainFilter.trim() || undefined,
      }),
    enabled: Boolean(accessToken),
  })

  const deleteMutation = useMutation({
    mutationFn: (tenantId: number) => deleteTenant(tenantId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setSelectedIds(new Set())
      toast.success('Tenant supprimé')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erreur de suppression'),
  })

  const list = data?.items ?? []
  const hasMore = data?.hasMore ?? false
  const canPrev = page > 0
  const canNext = hasMore

  const selectableOnPage = list.filter((t) => t.id !== DEFAULT_TENANT_ID)
  const selectedOnPage = selectableOnPage.filter((t) => selectedIds.has(t.id)).length
  const allPageSelected = selectableOnPage.length > 0 && selectedOnPage === selectableOnPage.length
  const somePageSelected = selectedOnPage > 0 && !allPageSelected

  const toggleRow = (id: number) => {
    if (id === DEFAULT_TENANT_ID) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const t of selectableOnPage) next.delete(t.id)
      } else {
        for (const t of selectableOnPage) next.add(t.id)
      }
      return next
    })
  }

  const applyDomainFilter = () => {
    setDomainFilter(domainDraft.trim())
    setPage(0)
  }

  const clearDomainFilter = () => {
    setDomainDraft('')
    setDomainFilter('')
    setPage(0)
  }

  const confirmDeleteOne = (id: number, name: string) => {
    if (id === DEFAULT_TENANT_ID) return
    if (!window.confirm(`Supprimer définitivement le tenant « ${name} » et ses utilisateurs admin ?`)) return
    deleteMutation.mutate(id)
  }

  const confirmBulkDelete = () => {
    const ids = [...selectedIds].filter((id) => id !== DEFAULT_TENANT_ID).sort((a, b) => a - b)
    if (ids.length === 0) return
    if (!window.confirm(`Supprimer ${ids.length} tenant(s) ? Cette action est irréversible.`)) return
    void (async () => {
      setBulkBusy(true)
      try {
        for (const id of ids) {
          await deleteTenant(id, accessToken!)
        }
        void queryClient.invalidateQueries({ queryKey: ['tenants'] })
        setSelectedIds(new Set())
        toast.success(`${ids.length} tenant(s) supprimé(s)`)
      } catch (e) {
        void queryClient.invalidateQueries({ queryKey: ['tenants'] })
        toast.error(e instanceof Error ? e.message : 'Erreur lors de la suppression groupée')
      } finally {
        setBulkBusy(false)
      }
    })()
  }

  React.useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(list.map((t) => t.id))
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [list])

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

  const startRow = list.length === 0 ? 0 : page * pageSize + 1
  const endRow = page * pageSize + list.length
  const rangeLabel = list.length === 0 ? 'Aucune ligne' : `Lignes ${startRow}–${endRow}`

  return (
    <PageLayout
      title="Tenants"
      description="Gérer les organisations et domaines"
      action={<Button>Créer un tenant</Button>}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Filtre domaine (ex. <code className="rounded bg-white px-1 dark:bg-slate-800">e2e-</code> pour les tenants
          de tests), puis sélection multiple et suppression groupée. Le tenant <strong>id {DEFAULT_TENANT_ID}</strong>{' '}
          n’est jamais supprimable.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="tenant-domain-filter" className="mb-1 block text-xs font-medium text-slate-600">
              Domaine contient
            </label>
            <Input
              id="tenant-domain-filter"
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              placeholder="e2e-"
              className="w-full"
            />
          </div>
          <Button type="button" variant="secondary" onClick={applyDomainFilter}>
            Appliquer le filtre
          </Button>
          <Button type="button" variant="ghost" onClick={clearDomainFilter}>
            Tous les tenants
          </Button>
          <Button type="button" variant="ghost" onClick={toggleSelectPage} disabled={selectableOnPage.length === 0}>
            {allPageSelected ? 'Désélectionner la page' : 'Sélectionner la page'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            disabled={selectedIds.size === 0 || deleteMutation.isPending || bulkBusy}
            onClick={() => confirmBulkDelete()}
          >
            Supprimer la sélection ({selectedIds.size})
          </Button>
        </div>
      </div>

      <Card>
        <TableWrapper>
          <TableHead>
            <Th className="w-10">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={allPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePageSelected && !allPageSelected
                }}
                aria-label="Sélectionner tous les tenants de la page"
                onChange={toggleSelectPage}
                disabled={selectableOnPage.length === 0}
                title="Sélectionner la page"
              />
            </Th>
            <Th>Nom</Th>
            <Th>Domaine</Th>
            <Th>Statut</Th>
            <Th>Actions</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  Aucun tenant{domainFilter ? ' pour ce filtre' : ''}.
                </td>
              </tr>
            ) : (
              list.map((t) => (
                <tr key={t.id}>
                  <Td className="w-10">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selectedIds.has(t.id)}
                      disabled={t.id === DEFAULT_TENANT_ID}
                      onChange={() => toggleRow(t.id)}
                      title={t.id === DEFAULT_TENANT_ID ? 'Tenant par défaut' : ''}
                    />
                  </Td>
                  <Td className="font-medium text-slate-900">{t.name}</Td>
                  <Td className="text-slate-600">{t.domain}</Td>
                  <Td>
                    <Badge variant={t.is_active ? 'success' : 'default'}>
                      {t.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" className="!px-2 !py-1 text-xs">
                        Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        disabled={t.id === DEFAULT_TENANT_ID || deleteMutation.isPending}
                        onClick={() => confirmDeleteOne(t.id, t.name)}
                      >
                        Supprimer
                      </Button>
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
          rangeLabel={rangeLabel}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </Card>
    </PageLayout>
  )
}
