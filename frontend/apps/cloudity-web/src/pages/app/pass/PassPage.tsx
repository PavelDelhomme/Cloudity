/**
 * PassPage — gestionnaire de mots de passe Cloudity (web).
 *
 * Architecture (cf. docs/securite/PASS-CRYPTO.md, docs/produit/SPRINT-PASS-2026-05.md) :
 *  - **Connexion Cloudity** d’abord (route `/app/*` protégée par `RequireAuth`).
 *  - Coffre **verrouillé** par défaut : si `GET /pass/vaults` est vide → écran
 *    **initialisation** (choix maître + confirmation) ; sinon → **déverrouillage**.
 *  - Les **alias mail** (`PassMailAliasesPanel`) : après déverrouillage du coffre.
 *  - Une fois déverrouillé, la **master key** (32 octets) vit uniquement en mémoire
 *    React (`vaultContext`). Auto-lock après 5 min d'inactivité.
 *  - Toutes les entrées sont **chiffrées côté client** via `@cloudity/pass-crypto`
 *    avant d'être envoyées en POST/PUT. Le serveur (`passwords-service`) ne lit
 *    jamais le contenu — il étiquette uniquement la `format_version` (= 1 pour
 *    EnvelopeV1).
 */

import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { parseJwtPayload } from '@cloudity/shared'
import { Badge, Button, Card, CardHeader, Input } from '@cloudity/ui'
import {
  decryptItemFromVault,
  encryptItemForVault,
  type ItemPlaintextV1,
} from '@cloudity/pass-crypto'
import { Lock, Plus, KeyRound, ShieldCheck, AlertTriangle, Upload, Trash2 } from 'lucide-react'
import { useAuth } from '../../../authContext'
import {
  fetchVaults,
  createVault,
  deleteVault,
  fetchVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  type VaultResponse,
  type PassItemResponse,
} from '../../../api'
import { VaultProvider, useVault, useUnlockedVault } from './vaultContext'
import UnlockScreen from './UnlockScreen'
import ItemEditor, { type ItemEditorValue } from './ItemEditor'
import ProtonImportDialog from './ProtonImportDialog'
import PassMailAliasesPanel from './PassMailAliasesPanel'
import PassBackupActions from './PassBackupActions'
import PassFavicon from './PassFavicon'
import type { ConvertedItem } from './protonImport'

// --- Helpers ----------------------------------------------------------

function readUserIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  const payload = parseJwtPayload(token)
  if (!payload) return null
  const v = payload.user_id ?? payload.sub
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null
}

const EMPTY_LOGIN: ItemPlaintextV1 = {
  schema: 1,
  type: 'login',
  fields: { title: '', url: '', username: '', password: '' },
}

interface DecryptedItem {
  id: number
  vaultId: number
  ciphertext: string
  formatVersion: number
  plaintext: ItemPlaintextV1 | null
  decryptError: string | null
}

// --- Outer component (provides VaultContext) --------------------------

export default function PassPage() {
  return (
    <VaultProvider>
      <PassPageInner />
    </VaultProvider>
  )
}

// --- Inner ------------------------------------------------------------

function PassPageInner() {
  const { accessToken, logout } = useAuth()
  const userId = useMemo(() => readUserIdFromToken(accessToken), [accessToken])
  const { state } = useVault()

  const vaultsProbe = useQuery({
    queryKey: ['vaults'],
    queryFn: () => fetchVaults(accessToken!),
    enabled: Boolean(accessToken && userId && state.status === 'locked'),
    retry: false,
    staleTime: 60 * 1000,
  })

  if (!accessToken || !userId) {
    return (
      <div className="py-8 flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-400">
        <p>
          Session ou identifiant utilisateur indisponible. Normalement, la page Pass
          n’est accessible qu’après connexion Cloudity.
        </p>
        <Link
          to="/login?next=/app/pass"
          className="text-brand-600 dark:text-brand-400 font-medium hover:underline w-fit"
        >
          Aller à la connexion
        </Link>
      </div>
    )
  }

  const aliasesPanel = (
    <PassMailAliasesPanel accessToken={accessToken} logout={logout} />
  )

  if (state.status !== 'unlocked') {
    const probePending = vaultsProbe.isPending || vaultsProbe.isFetching
    const unlockMode: 'setup' | 'unlock' =
      !vaultsProbe.isError && Array.isArray(vaultsProbe.data) && vaultsProbe.data.length === 0
        ? 'setup'
        : 'unlock'

    return (
      <div className="flex flex-col gap-6">
        <PassHeader locked />
        {vaultsProbe.isError && (
          <p
            className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3"
            role="status"
          >
            Impossible de vérifier si tu as déjà des coffres (réseau ou serveur). Le
            formulaire ci-dessous suppose un <strong>coffre existant</strong>. Si c’est
            vraiment ta <strong>première</strong> fois sur Pass, recharge la page une
            fois la stack joignable : l’écran proposera alors l’
            <strong>initialisation</strong> avec confirmation du mot de passe maître.
          </p>
        )}
        {probePending ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span
              className="inline-block h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"
              aria-hidden
            />
            Vérification de ton espace Pass…
          </div>
        ) : (
          <UnlockScreen userId={userId} mode={unlockMode} />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <UnlockedPass accessToken={accessToken} userId={userId} logout={logout} />
      {aliasesPanel}
    </div>
  )
}

function PassHeader({
  locked = false,
  onLock,
}: {
  locked?: boolean
  onLock?: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight inline-flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-brand-500" aria-hidden />
          Pass
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Coffre chiffré côté client (Argon2id + XChaCha20-Poly1305 + HKDF-SHA-256).
          {locked ? ' Verrouillé.' : null}
        </p>
      </div>
      {!locked && onLock && (
        <Button variant="ghost" onClick={onLock} aria-label="Verrouiller le coffre">
          <Lock className="w-4 h-4 mr-1.5" aria-hidden />
          Verrouiller
        </Button>
      )}
    </div>
  )
}

// --- Unlocked state ---------------------------------------------------

interface UnlockedPassProps {
  accessToken: string
  userId: string
  logout: () => void
}

function UnlockedPass({ accessToken, userId, logout }: UnlockedPassProps) {
  const queryClient = useQueryClient()
  const vault = useUnlockedVault()
  const { lock } = useVault()
  const [newVaultName, setNewVaultName] = useState('')
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null)
  const [editing, setEditing] = useState<ItemEditorValue | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)

  // --- Vaults --------------------------------------------------------

  const vaultsQuery = useQuery({
    queryKey: ['vaults'],
    queryFn: () => fetchVaults(accessToken),
    retry: false,
    staleTime: 60 * 1000,
    onError: (err: Error) => {
      if (err?.message?.includes('401')) {
        logout()
        toast.error('Session expirée. Reconnectez-vous.')
      }
    },
  })

  const vaultsList = vaultsQuery.data ?? []

  // Sélection initiale automatique du premier vault.
  React.useEffect(() => {
    if (selectedVaultId == null && vaultsList.length > 0) {
      setSelectedVaultId(vaultsList[0].id)
    }
  }, [vaultsList, selectedVaultId])

  const selectedVault = vaultsList.find((v) => v.id === selectedVaultId) ?? null

  const createVaultMutation = useMutation({
    mutationFn: (name: string) => createVault(accessToken, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaults'] })
      setNewVaultName('')
      toast.success('Coffre créé')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteVaultMutation = useMutation({
    mutationFn: (vaultId: number) => deleteVault(accessToken, vaultId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['vaults'] })
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'vault-items',
      })
      if (selectedVaultId === deletedId) {
        setSelectedVaultId(null)
        setEditing(null)
      }
      toast.success('Coffre supprimé')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- Items + déchiffrement -----------------------------------------

  const itemsQuery = useQuery({
    queryKey: ['vault-items', selectedVaultId],
    queryFn: () => fetchVaultItems(accessToken, selectedVaultId!),
    enabled: Boolean(selectedVaultId),
    staleTime: 30 * 1000,
  })

  const decryptedItems = useMemo<DecryptedItem[]>(() => {
    if (!itemsQuery.data || !selectedVault) return []
    return itemsQuery.data.map((it: PassItemResponse) => {
      const base: DecryptedItem = {
        id: it.id,
        vaultId: it.vault_id,
        ciphertext: it.ciphertext,
        formatVersion: (it as { format_version?: number }).format_version ?? 1,
        plaintext: null,
        decryptError: null,
      }
      try {
        base.plaintext = decryptItemFromVault({
          masterKey: vault.masterKey,
          vaultId: String(selectedVault.id),
          encoded: it.ciphertext,
        })
      } catch (err) {
        base.decryptError = err instanceof Error ? err.message : 'décryption KO'
      }
      return base
    })
  }, [itemsQuery.data, selectedVault, vault.masterKey])

  const filteredItems = useMemo(() => {
    if (!search.trim()) return decryptedItems
    const q = search.trim().toLowerCase()
    return decryptedItems.filter((it) => {
      if (it.plaintext == null) return false
      const f = it.plaintext.fields as Record<string, unknown>
      const haystack = [f.title, f.url, f.username, it.plaintext.notes]
        .filter((s): s is string => typeof s === 'string')
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [decryptedItems, search])

  // --- Mutations create / update / delete ----------------------------

  const saveMutation = useMutation({
    mutationFn: async (val: ItemEditorValue) => {
      if (!selectedVault) throw new Error('Aucun coffre sélectionné')
      const vaultIdStr = String(selectedVault.id)
      const itemIdStr = val.id != null ? String(val.id) : crypto.randomUUID()
      const ciphertext = encryptItemForVault({
        masterKey: vault.masterKey,
        vaultId: vaultIdStr,
        itemId: itemIdStr,
        plaintext: val.plaintext,
        kdf: vault.kdf,
        saltUser: vault.saltUser,
      })
      if (val.id == null) {
        return createVaultItem(accessToken, selectedVault.id, ciphertext, 1)
      }
      return updateVaultItem(accessToken, val.id, ciphertext, 1)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items', selectedVaultId] })
      setEditing(null)
      toast.success('Entrée chiffrée + enregistrée')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteVaultItem(accessToken, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items', selectedVaultId] })
      setEditing(null)
      toast.success('Entrée supprimée')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  /**
   * Import Proton : chiffre + uploade chaque item, avec une concurrence bornée
   * pour ne pas saturer le serveur tout en étant bien plus rapide qu'un POST
   * séquentiel pour un export de centaines d'entrées.
   */
  const onProtonImport = async (
    items: ConvertedItem[]
  ): Promise<{ ok: number; failed: number }> => {
    if (!selectedVault) return { ok: 0, failed: items.length }
    const vaultIdStr = String(selectedVault.id)
    const concurrency = 4
    let ok = 0
    let failed = 0
    let i = 0
    const worker = async () => {
      while (i < items.length) {
        const idx = i++
        const it = items[idx]
        try {
          const itemIdStr = crypto.randomUUID()
          const ciphertext = encryptItemForVault({
            masterKey: vault.masterKey,
            vaultId: vaultIdStr,
            itemId: itemIdStr,
            plaintext: it.plaintext,
            kdf: vault.kdf,
            saltUser: vault.saltUser,
          })
          await createVaultItem(accessToken, selectedVault.id, ciphertext, 1)
          ok++
        } catch (err) {
          console.warn('[proton-import] échec item', it.source.itemId, err)
          failed++
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    queryClient.invalidateQueries({ queryKey: ['vault-items', selectedVaultId] })
    return { ok, failed }
  }

  // --- Render --------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <PassHeader onLock={lock} />
      <PassBackupActions
        accessToken={accessToken}
        userId={userId}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['vaults'] })
          queryClient.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'vault-items',
          })
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Colonne 1 : vaults */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Mes coffres</h3>
          </CardHeader>
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <Input
              type="text"
              placeholder="Nouveau coffre…"
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => createVaultMutation.mutate(newVaultName.trim() || 'Mon coffre')}
              disabled={createVaultMutation.isPending}
              aria-label="Créer un coffre"
            >
              {createVaultMutation.isPending ? '…' : <Plus className="w-4 h-4" aria-hidden />}
            </Button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {vaultsList.length === 0 ? (
              <li className="px-6 py-6 text-slate-500 dark:text-slate-400 text-sm">
                Aucun coffre. Créez-en un ci-dessus.
              </li>
            ) : (
              vaultsList.map((v: VaultResponse) => (
                <li key={v.id} className="flex items-stretch divide-x divide-slate-100 dark:divide-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVaultId(v.id)
                      setEditing(null)
                    }}
                    className={`flex-1 min-w-0 text-left px-6 py-3 text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                      selectedVaultId === v.id
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="truncate">{v.name}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal shrink-0">#{v.id}</span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 px-3 text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                    aria-label={`Supprimer le coffre ${v.name}`}
                    disabled={deleteVaultMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (
                        confirm(
                          `Supprimer définitivement le coffre « ${v.name} » et toutes ses entrées ? Cette action est irréversible.`
                        )
                      ) {
                        deleteVaultMutation.mutate(v.id)
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>

        {/* Colonne 2 : items / éditeur */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                {selectedVault ? selectedVault.name : 'Sélectionner un coffre'}
              </h3>
              {selectedVault && !editing && !importing && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setImporting(true)}
                  >
                    <Upload className="w-4 h-4 mr-1.5" aria-hidden />
                    Importer Proton
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      setEditing({ plaintext: structuredClone(EMPTY_LOGIN) })
                    }
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                    Nouvelle entrée
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          {!selectedVault ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Sélectionne un coffre dans la colonne de gauche, ou crées-en un nouveau.
            </div>
          ) : importing ? (
            <div className="p-6">
              <ProtonImportDialog
                targetVaultId={selectedVault.id}
                targetVaultName={selectedVault.name}
                onClose={() => setImporting(false)}
                onConfirm={onProtonImport}
              />
            </div>
          ) : editing ? (
            <ItemEditor
              initial={editing}
              vaultName={selectedVault.name}
              saving={saveMutation.isPending}
              deleting={deleteMutation.isPending}
              onCancel={() => setEditing(null)}
              onSave={(val) => saveMutation.mutate(val)}
              onDelete={
                editing.id != null
                  ? () => {
                      if (confirm('Supprimer définitivement cette entrée ?')) {
                        deleteMutation.mutate(editing.id!)
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="px-4 pt-3 pb-2">
                <Input
                  type="search"
                  placeholder="Rechercher (titre, URL, utilisateur, notes)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <ItemList
                items={filteredItems}
                loading={itemsQuery.isLoading}
                onPick={(it) => {
                  if (it.plaintext == null) {
                    toast.error(it.decryptError ?? 'Item illisible')
                    return
                  }
                  setEditing({ id: it.id, plaintext: it.plaintext })
                }}
              />
            </>
          )}
        </Card>
      </div>

    </div>
  )
}

// --- ItemList ----------------------------------------------------------

function ItemList({
  items,
  loading,
  onPick,
}: {
  items: DecryptedItem[]
  loading: boolean
  onPick: (it: DecryptedItem) => void
}) {
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
        <span className="inline-block h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        Déchiffrement local…
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        Aucune entrée. Clique sur <strong>Nouvelle entrée</strong> en haut à droite.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
      {items.map((it) => {
        const f = (it.plaintext?.fields ?? {}) as Record<string, unknown>
        const title = typeof f.title === 'string' && f.title ? f.title : `Entrée #${it.id}`
        const subtitle =
          typeof f.username === 'string' && f.username
            ? String(f.username)
            : typeof f.url === 'string'
              ? String(f.url)
              : ''
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onPick(it)}
              className="w-full text-left px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex items-center gap-2">
                <PassFavicon
                  url={typeof f.url === 'string' ? f.url : undefined}
                  title={title}
                  size={22}
                />
                <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {title}
                </div>
                {subtitle && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {subtitle}
                  </div>
                )}
                </div>
              </div>
              {it.decryptError ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                  Illisible
                </span>
              ) : (
                <Badge>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" aria-hidden />
                  v{it.formatVersion}
                </Badge>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
