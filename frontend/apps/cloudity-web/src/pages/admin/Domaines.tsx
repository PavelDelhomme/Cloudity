import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../authContext'
import {
  fetchDomainsPage,
  createDomain,
  patchDomain,
  deleteDomain,
  fetchDomainMailboxesPage,
  fetchDomainAliasesPage,
  createDomainMailbox,
  deleteDomainMailbox,
  createDomainAlias,
  deleteDomainAlias,
  patchDomainMailbox,
  patchDomainAlias,
} from '../../api'
import toast from 'react-hot-toast'
import { Badge, Button, Card, Input, PageLayout, TBody, TableHead, TableWrapper, Td, Th } from '@cloudity/ui'
import { PaginationControls } from '../../components/PaginationControls'

export default function Domaines() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null)
  const [detailsTab, setDetailsTab] = useState<'mailboxes' | 'aliases'>('mailboxes')
  const [detailsPage, setDetailsPage] = useState(0)
  const detailsPageSize = 20
  const [newLocalPart, setNewLocalPart] = useState('')
  const [newQuotaMb, setNewQuotaMb] = useState('0')
  const [newAliasSource, setNewAliasSource] = useState('')
  const [newAliasDestination, setNewAliasDestination] = useState('')
  const [editingMailboxId, setEditingMailboxId] = useState<number | null>(null)
  const [editingMailboxQuota, setEditingMailboxQuota] = useState('')
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null)
  const [editingAliasDestination, setEditingAliasDestination] = useState('')

  const { data: domainsData, isLoading, error } = useQuery({
    queryKey: ['mail-domains', page, pageSize],
    queryFn: () => fetchDomainsPage(accessToken!, { skip: page * pageSize, pageSize }),
    enabled: Boolean(accessToken),
  })
  const { data: mailboxesData, isLoading: mailboxesLoading, error: mailboxesError } = useQuery({
    queryKey: ['mail-domain-mailboxes', selectedDomainId, detailsPage, detailsPageSize],
    queryFn: () =>
      fetchDomainMailboxesPage(accessToken!, selectedDomainId!, {
        skip: detailsPage * detailsPageSize,
        pageSize: detailsPageSize,
      }),
    enabled: Boolean(accessToken && selectedDomainId != null && detailsTab === 'mailboxes'),
  })
  const { data: aliasesData, isLoading: aliasesLoading, error: aliasesError } = useQuery({
    queryKey: ['mail-domain-aliases', selectedDomainId, detailsPage, detailsPageSize],
    queryFn: () =>
      fetchDomainAliasesPage(accessToken!, selectedDomainId!, {
        skip: detailsPage * detailsPageSize,
        pageSize: detailsPageSize,
      }),
    enabled: Boolean(accessToken && selectedDomainId != null && detailsTab === 'aliases'),
  })

  const createMutation = useMutation({
    mutationFn: (domain: string) => createDomain(accessToken!, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-domains'] })
      setNewDomain('')
      toast.success('Domaine créé')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erreur création domaine')
    },
  })
  const patchDomainMutation = useMutation({
    mutationFn: (payload: { domainId: number; is_active: boolean }) =>
      patchDomain(accessToken!, payload.domainId, { is_active: payload.is_active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mail-domains'] })
      toast.success('Domaine mis à jour')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur mise à jour domaine'),
  })
  const deleteDomainMutation = useMutation({
    mutationFn: (domainId: number) => deleteDomain(accessToken!, domainId),
    onSuccess: (_, domainId) => {
      if (selectedDomainId === domainId) setSelectedDomainId(null)
      void queryClient.invalidateQueries({ queryKey: ['mail-domains'] })
      toast.success('Domaine supprimé')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur suppression domaine'),
  })
  const createMailboxMutation = useMutation({
    mutationFn: (payload: { domainId: number; local_part: string; quota_mb: number }) =>
      createDomainMailbox(accessToken!, payload.domainId, {
        local_part: payload.local_part,
        quota_mb: payload.quota_mb,
      }),
    onSuccess: () => {
      setNewLocalPart('')
      setNewQuotaMb('0')
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-mailboxes', selectedDomainId] })
      toast.success('Boîte mail créée')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur création boîte mail'),
  })
  const deleteMailboxMutation = useMutation({
    mutationFn: (payload: { domainId: number; mailboxId: number }) =>
      deleteDomainMailbox(accessToken!, payload.domainId, payload.mailboxId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-mailboxes', selectedDomainId] })
      toast.success('Boîte mail supprimée')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur suppression boîte mail'),
  })
  const createAliasMutation = useMutation({
    mutationFn: (payload: { domainId: number; source_local: string; destination: string }) =>
      createDomainAlias(accessToken!, payload.domainId, payload),
    onSuccess: () => {
      setNewAliasSource('')
      setNewAliasDestination('')
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-aliases', selectedDomainId] })
      toast.success('Alias créé')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur création alias'),
  })
  const deleteAliasMutation = useMutation({
    mutationFn: (payload: { domainId: number; aliasId: number }) =>
      deleteDomainAlias(accessToken!, payload.domainId, payload.aliasId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-aliases', selectedDomainId] })
      toast.success('Alias supprimé')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur suppression alias'),
  })
  const patchMailboxMutation = useMutation({
    mutationFn: (payload: { domainId: number; mailboxId: number; patch: { quota_mb?: number; is_active?: boolean } }) =>
      patchDomainMailbox(accessToken!, payload.domainId, payload.mailboxId, payload.patch),
    onSuccess: () => {
      setEditingMailboxId(null)
      setEditingMailboxQuota('')
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-mailboxes', selectedDomainId] })
      toast.success('Boîte mail mise à jour')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur mise à jour boîte mail'),
  })
  const patchAliasMutation = useMutation({
    mutationFn: (payload: { domainId: number; aliasId: number; destination: string }) =>
      patchDomainAlias(accessToken!, payload.domainId, payload.aliasId, { destination: payload.destination }),
    onSuccess: () => {
      setEditingAliasId(null)
      setEditingAliasDestination('')
      void queryClient.invalidateQueries({ queryKey: ['mail-domain-aliases', selectedDomainId] })
      toast.success('Alias mis à jour')
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur mise à jour alias'),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const domain = newDomain.trim()
    if (!domain) return
    createMutation.mutate(domain)
  }

  if (!accessToken) {
    return (
      <PageLayout title="Domaines mail">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Domaines mail">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Domaines mail">
        <p className="text-red-600">{error instanceof Error ? error.message : 'Erreur'}</p>
      </PageLayout>
    )
  }

  const list = domainsData?.items ?? []
  const selectedDomain = list.find((d) => d.id === selectedDomainId) ?? null
  const domainsHasMore = domainsData?.hasMore ?? false
  const canPrev = page > 0
  const canNext = domainsHasMore

  const domainMailboxes = mailboxesData?.items ?? []
  const mailboxesHasMore = mailboxesData?.hasMore ?? false
  const domainAliases = aliasesData?.items ?? []
  const aliasesHasMore = aliasesData?.hasMore ?? false

  const domainsRangeLabel =
    list.length === 0 ? 'Aucune ligne' : `Lignes ${page * pageSize + 1}–${page * pageSize + list.length}`
  const detailsListLen = detailsTab === 'mailboxes' ? domainMailboxes.length : domainAliases.length
  const detailsRangeLabel =
    detailsListLen === 0
      ? 'Aucune ligne'
      : `Lignes ${detailsPage * detailsPageSize + 1}–${detailsPage * detailsPageSize + detailsListLen}`
  const detailsCanNext = detailsTab === 'mailboxes' ? mailboxesHasMore : aliasesHasMore

  return (
    <PageLayout
      title="Domaines mail"
      description="Domaines, boîtes et alias du mail-directory-service. Les réponses vides/null sont traitées comme des listes vides."
      action={
        <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="exemple.com"
            className="w-full sm:w-44"
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !newDomain.trim()}
          >
            {createMutation.isPending ? 'Création…' : 'Ajouter'}
          </Button>
        </form>
      }
    >
      <Card className="p-4 mb-4 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20">
        <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">État opérationnel</p>
        <p className="mt-1 text-sm text-blue-900/90 dark:text-blue-100/90">
          Cette page admin pilote l’annuaire mail Cloudity. Si le service renvoie une liste vide ou un corps nul pendant un
          chargement, l’UI reste en état vide au lieu de casser la page.
        </p>
      </Card>

      <Card>
        <TableWrapper>
          <TableHead>
            <Th>Domaine</Th>
            <Th>Statut</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                  Aucun domaine. Ajoutez-en un pour la Phase 2 Mail.
                </td>
              </tr>
            ) : (
              list.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium text-slate-900">{d.domain}</Td>
                  <Td>
                    <button
                      type="button"
                      className="inline-flex"
                      onClick={() => patchDomainMutation.mutate({ domainId: d.id, is_active: !d.is_active })}
                    >
                      <Badge variant={d.is_active ? 'success' : 'default'}>
                        {d.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </button>
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => {
                        setSelectedDomainId((prev) => (prev === d.id ? null : d.id))
                        setDetailsPage(0)
                        setDetailsTab('mailboxes')
                      }}
                    >
                      {selectedDomainId === d.id ? 'Masquer détails' : 'Voir détails'}
                    </Button>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (!window.confirm(`Supprimer le domaine ${d.domain} ?`)) return
                        deleteDomainMutation.mutate(d.id)
                      }}
                    >
                      Supprimer
                    </Button>
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
          rangeLabel={domainsRangeLabel}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </Card>
      {selectedDomainId != null ? (
        <Card>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Détails du domaine{selectedDomain ? ` · ${selectedDomain.domain}` : ''}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Boîtes locales et alias routés pour ce domaine.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant={detailsTab === 'mailboxes' ? 'secondary' : 'ghost'}
                className="!px-3 !py-1.5 text-xs"
                onClick={() => {
                  setDetailsTab('mailboxes')
                  setDetailsPage(0)
                }}
              >
                Boîtes mail
              </Button>
              <Button
                variant={detailsTab === 'aliases' ? 'secondary' : 'ghost'}
                className="!px-3 !py-1.5 text-xs"
                onClick={() => {
                  setDetailsTab('aliases')
                  setDetailsPage(0)
                }}
              >
                Aliases
              </Button>
            </div>
          </div>
          {detailsTab === 'mailboxes' ? (
            <form
              className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (!selectedDomainId) return
                const local = newLocalPart.trim().toLowerCase()
                if (!local) return
                const quota = Math.max(0, Number.parseInt(newQuotaMb || '0', 10) || 0)
                createMailboxMutation.mutate({ domainId: selectedDomainId, local_part: local, quota_mb: quota })
              }}
            >
              <Input
                placeholder="local-part"
                value={newLocalPart}
                onChange={(e) => setNewLocalPart(e.target.value)}
                className="w-full sm:max-w-[220px]"
              />
              <Input
                type="number"
                min={0}
                placeholder="Quota (Mo)"
                value={newQuotaMb}
                onChange={(e) => setNewQuotaMb(e.target.value)}
                className="w-full sm:max-w-[140px]"
              />
              <Button type="submit" disabled={createMailboxMutation.isPending || !newLocalPart.trim()}>
                {createMailboxMutation.isPending ? 'Création…' : 'Créer boîte'}
              </Button>
            </form>
          ) : (
            <form
              className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (!selectedDomainId) return
                const source = newAliasSource.trim().toLowerCase()
                const destination = newAliasDestination.trim().toLowerCase()
                if (!source || !destination) return
                createAliasMutation.mutate({ domainId: selectedDomainId, source_local: source, destination })
              }}
            >
              <Input
                placeholder="source_local"
                value={newAliasSource}
                onChange={(e) => setNewAliasSource(e.target.value)}
                className="w-full sm:max-w-[220px]"
              />
              <Input
                placeholder="destination@exemple.com"
                value={newAliasDestination}
                onChange={(e) => setNewAliasDestination(e.target.value)}
                className="w-full sm:max-w-[280px]"
              />
              <Button type="submit" disabled={createAliasMutation.isPending || !newAliasSource.trim() || !newAliasDestination.trim()}>
                {createAliasMutation.isPending ? 'Création…' : 'Créer alias'}
              </Button>
            </form>
          )}
          <TableWrapper>
            <TableHead>
              {detailsTab === 'mailboxes' ? (
                <>
                  <Th>Local part</Th>
                  <Th>Quota (Mo)</Th>
                  <Th>Statut</Th>
                  <Th className="text-right">Actions</Th>
                </>
              ) : (
                <>
                  <Th>Source</Th>
                  <Th>Destination</Th>
                  <Th>Expiration</Th>
                  <Th className="text-right">Actions</Th>
                </>
              )}
            </TableHead>
            <TBody>
              {detailsTab === 'mailboxes' ? (
                mailboxesError ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-red-600">
                      {mailboxesError instanceof Error ? mailboxesError.message : 'Erreur chargement boîtes mail'}
                    </td>
                  </tr>
                ) : mailboxesLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Chargement des boîtes…
                    </td>
                  </tr>
                ) : domainMailboxes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Aucune boîte mail.
                    </td>
                  </tr>
                ) : (
                  domainMailboxes.map((m) => (
                    <tr key={m.id}>
                      <Td className="font-medium text-slate-900">{m.local_part}</Td>
                      <Td>
                        {editingMailboxId === m.id ? (
                          <Input
                            type="number"
                            min={0}
                            value={editingMailboxQuota}
                            onChange={(e) => setEditingMailboxQuota(e.target.value)}
                            className="max-w-[120px]"
                          />
                        ) : (
                          m.quota_mb
                        )}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className="inline-flex"
                          onClick={() => {
                            if (!selectedDomainId) return
                            patchMailboxMutation.mutate({
                              domainId: selectedDomainId,
                              mailboxId: m.id,
                              patch: { is_active: !m.is_active },
                            })
                          }}
                        >
                          <Badge variant={m.is_active ? 'success' : 'default'}>
                            {m.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                        </button>
                      </Td>
                      <Td className="text-right">
                        {editingMailboxId === m.id ? (
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => {
                              if (!selectedDomainId) return
                              const quota = Math.max(0, Number.parseInt(editingMailboxQuota || '0', 10) || 0)
                              patchMailboxMutation.mutate({
                                domainId: selectedDomainId,
                                mailboxId: m.id,
                                patch: { quota_mb: quota },
                              })
                            }}
                          >
                            Enregistrer
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => {
                              setEditingMailboxId(m.id)
                              setEditingMailboxQuota(String(m.quota_mb))
                            }}
                          >
                            Modifier
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => {
                            if (!selectedDomainId) return
                            if (!window.confirm(`Supprimer la boîte ${m.local_part} ?`)) return
                            deleteMailboxMutation.mutate({ domainId: selectedDomainId, mailboxId: m.id })
                          }}
                        >
                          Supprimer
                        </Button>
                      </Td>
                    </tr>
                  ))
                )
              ) : aliasesError ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-red-600">
                    {aliasesError instanceof Error ? aliasesError.message : 'Erreur chargement aliases'}
                  </td>
                </tr>
              ) : aliasesLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Chargement des aliases…
                  </td>
                </tr>
              ) : domainAliases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Aucun alias.
                  </td>
                </tr>
              ) : (
                domainAliases.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium text-slate-900">{a.source_local}</Td>
                    <Td className="text-slate-700">
                      {editingAliasId === a.id ? (
                        <Input
                          value={editingAliasDestination}
                          onChange={(e) => setEditingAliasDestination(e.target.value)}
                          className="max-w-[280px]"
                        />
                      ) : (
                        a.destination
                      )}
                    </Td>
                    <Td className="text-slate-500">{a.expires_at || '—'}</Td>
                    <Td className="text-right">
                      {editingAliasId === a.id ? (
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => {
                            if (!selectedDomainId) return
                            const destination = editingAliasDestination.trim().toLowerCase()
                            if (!destination) return
                            patchAliasMutation.mutate({ domainId: selectedDomainId, aliasId: a.id, destination })
                          }}
                        >
                          Enregistrer
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => {
                            setEditingAliasId(a.id)
                            setEditingAliasDestination(a.destination)
                          }}
                        >
                          Modifier
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (!selectedDomainId) return
                          if (!window.confirm(`Supprimer l'alias ${a.source_local} ?`)) return
                          deleteAliasMutation.mutate({ domainId: selectedDomainId, aliasId: a.id })
                        }}
                      >
                        Supprimer
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </TBody>
          </TableWrapper>
          <PaginationControls
            page={detailsPage}
            canPrev={detailsPage > 0}
            canNext={detailsCanNext}
            rangeLabel={detailsRangeLabel}
            onPrev={() => setDetailsPage((p) => Math.max(0, p - 1))}
            onNext={() => setDetailsPage((p) => p + 1)}
          />
        </Card>
      ) : null}
    </PageLayout>
  )
}
