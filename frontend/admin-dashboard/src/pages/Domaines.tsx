import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchDomains, createDomain } from '../api'
import toast from 'react-hot-toast'
import { PageLayout, Card, TableWrapper, TableHead, Th, TBody, Td, Badge, Button, Input } from '../components/PageLayout'

export default function Domaines() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')

  const { data: domains, isLoading, error } = useQuery({
    queryKey: ['mail-domains'],
    queryFn: () => fetchDomains(accessToken!),
    enabled: Boolean(accessToken),
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

  const list = domains ?? []

  return (
    <PageLayout
      title="Domaines mail"
      description="Domaines pour la Phase 2 Mail"
      action={
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="exemple.com"
            className="w-44"
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
      <Card>
        <TableWrapper>
          <TableHead>
            <Th>Domaine</Th>
            <Th>Statut</Th>
          </TableHead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-12 text-center text-slate-500">
                  Aucun domaine. Ajoutez-en un pour la Phase 2 Mail.
                </td>
              </tr>
            ) : (
              list.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium text-slate-900">{d.domain}</Td>
                  <Td>
                    <Badge variant={d.is_active ? 'success' : 'default'}>
                      {d.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
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
