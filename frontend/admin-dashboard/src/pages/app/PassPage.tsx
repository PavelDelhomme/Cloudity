import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../authContext'
import { fetchVaults, createVault, fetchVaultItems } from '../../api'
import toast from 'react-hot-toast'
import { Card, CardHeader, Button, Input, Badge } from '../../components/PageLayout'

export default function PassPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [newVaultName, setNewVaultName] = useState('')
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null)

  const { data: vaults, isLoading, error } = useQuery({
    queryKey: ['vaults'],
    queryFn: () => fetchVaults(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 60 * 1000,
    onError: (err: Error) => {
      if (err?.message?.includes('401')) {
        logout()
        toast.error('Session expirée. Reconnectez-vous.')
      }
    },
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['vault-items', selectedVaultId],
    queryFn: () => fetchVaultItems(accessToken!, selectedVaultId!),
    enabled: Boolean(accessToken && selectedVaultId),
    staleTime: 30 * 1000,
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

  const list = vaults ?? []
  const selectedVault = list.find((v) => v.id === selectedVaultId)

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Pass</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Coffres et mots de passe sécurisés.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Nom du coffre"
            value={newVaultName}
            onChange={(e) => setNewVaultName(e.target.value)}
            className="w-48"
          />
          <Button
            onClick={() => createMutation.mutate(newVaultName || 'Mon coffre')}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Création…' : 'Nouveau coffre'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : 'Erreur'}
          {error instanceof Error && error.message.includes('401') && (
            <span className="block mt-2">
              <button
                type="button"
                onClick={() => { logout(); toast.success('Déconnecté. Reconnectez-vous pour continuer.'); }}
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                Se reconnecter
              </button>
            </span>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-8">
          <span className="inline-block h-4 w-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement des coffres…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Mes coffres</h3>
            </CardHeader>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {list.length === 0 ? (
                <li className="px-6 py-6 text-slate-500 dark:text-slate-400 text-sm">Aucun coffre. Créez-en un ci-dessus.</li>
              ) : (
                list.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedVaultId(v.id)}
                      className={`w-full text-left px-6 py-3.5 text-sm font-medium transition-colors flex items-center justify-between ${
                        selectedVaultId === v.id
                          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span>{v.name}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">#{v.id}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Card>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                {selectedVault ? selectedVault.name : 'Sélectionner un coffre'}
              </h3>
            </CardHeader>
            {selectedVaultId && (
              <div className="p-6">
                {itemsLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                    <span className="inline-block h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    Chargement…
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(items ?? []).length === 0 ? (
                      <li className="py-3 text-slate-500 dark:text-slate-400 text-sm">Aucune entrée (données chiffrées côté client).</li>
                    ) : (
                      (items ?? []).map((it) => (
                        <li key={it.id} className="py-3 flex items-center justify-between">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Entrée #{it.id}</span>
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
      )}
    </div>
  )
}
