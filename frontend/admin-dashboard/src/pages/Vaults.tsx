import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchVaults, createVault, fetchVaultItems } from '../api'
import toast from 'react-hot-toast'
import { PageLayout, Card, CardHeader, Button, Input, Badge } from '../components/PageLayout'

export default function Vaults() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [newVaultName, setNewVaultName] = useState('')
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null)

  const { data: vaults, isLoading, error } = useQuery({
    queryKey: ['vaults'],
    queryFn: () => fetchVaults(accessToken!),
    enabled: Boolean(accessToken),
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['vault-items', selectedVaultId],
    queryFn: () => fetchVaultItems(accessToken!, selectedVaultId!),
    enabled: Boolean(accessToken && selectedVaultId),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createVault(accessToken!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaults'] })
      setNewVaultName('')
      toast.success('Coffre créé')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!accessToken) {
    return (
      <PageLayout title="Coffres (Pass)">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Coffres (Pass)">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Coffres (Pass)">
        <p className="text-red-600">{error instanceof Error ? error.message : 'Erreur'}</p>
      </PageLayout>
    )
  }

  const list = vaults ?? []
  const selectedVault = list.find((v) => v.id === selectedVaultId)

  return (
    <PageLayout
      title="Coffres (Pass)"
      description="Coffres et entrées chiffrées côté client"
      action={
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Nom du coffre"
            value={newVaultName}
            onChange={(e) => setNewVaultName(e.target.value)}
            className="w-48"
            data-testid="new-vault-name"
          />
          <Button
            onClick={() => createMutation.mutate(newVaultName || 'Default')}
            disabled={createMutation.isPending}
            data-testid="create-vault-btn"
          >
            {createMutation.isPending ? 'Création…' : 'Créer un coffre'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Mes coffres</h3>
          </CardHeader>
          <ul className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <li className="px-6 py-6 text-slate-500 text-sm">Aucun coffre.</li>
            ) : (
              list.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVaultId(v.id)}
                    className={`w-full text-left px-6 py-3.5 text-sm font-medium transition-colors flex items-center justify-between ${
                      selectedVaultId === v.id
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    data-testid={`vault-${v.id}`}
                  >
                    <span>{v.name}</span>
                    <span className="text-slate-400 font-normal">#{v.id}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">
              {selectedVault ? `Entrées — ${selectedVault.name}` : 'Sélectionner un coffre'}
            </h3>
          </CardHeader>
          {selectedVaultId && (
            <div className="p-6">
              {itemsLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  Chargement des entrées…
                </div>
              ) : (
                <ul className="divide-y divide-slate-100" data-testid="vault-items-list">
                  {(items ?? []).length === 0 ? (
                    <li className="py-3 text-slate-500 text-sm">Aucune entrée (chiffrées côté client).</li>
                  ) : (
                    (items ?? []).map((it) => (
                      <li key={it.id} className="py-3 flex items-center justify-between">
                        <span className="text-sm text-slate-600">Entrée #{it.id}</span>
                        <Badge>Chiffré</Badge>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  )
}
