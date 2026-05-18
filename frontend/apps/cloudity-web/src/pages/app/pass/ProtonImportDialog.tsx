import React, { useMemo, useState } from 'react'
import { Button, Card, CardHeader } from '@cloudity/shared'
import { Upload, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  parseProtonImportFile,
  convertProtonToCloudity,
  ProtonImportError,
  type ConvertedItem,
} from './protonImport'

interface Props {
  /** Identifiant du vault Cloudity dans lequel importer (cible unique pour l'instant). */
  targetVaultId: number
  targetVaultName: string
  /** Bouton "Annuler" / "Fermer". */
  onClose: () => void
  /** Sauvegarde réelle (chiffrement + appel API) — orchestrée par le parent. */
  onConfirm: (items: ConvertedItem[]) => Promise<{ ok: number; failed: number }>
}

interface ParsedState {
  fileName: string
  vaults: { vaultId: string; vaultName: string; items: ConvertedItem[] }[]
}

/**
 * Dialogue d'import Proton Pass JSON. Trois étapes :
 *   1. Sélection du fichier (input `type="file"` + drop area).
 *   2. Aperçu : nombre de vaults / items, mapping logiques par vault.
 *   3. Confirmation → appel `onConfirm` qui chiffre + POST chacun en parallèle
 *      borné côté parent (concurrence 4).
 *
 * **Aucune donnée Proton n'est envoyée à un serveur tant que `onConfirm`
 * n'est pas appelé** — tout reste en mémoire navigateur.
 */
export default function ProtonImportDialog({
  targetVaultId,
  targetVaultName,
  onClose,
  onConfirm,
}: Props) {
  const [parsed, setParsed] = useState<ParsedState | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const [importing, setImporting] = useState(false)

  const totalItems = useMemo(
    () => parsed?.vaults.reduce((acc, v) => acc + v.items.length, 0) ?? 0,
    [parsed]
  )

  const onFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const exp = parseProtonImportFile(text, file.name)
      const vaults = convertProtonToCloudity(exp)
      setParsed({ fileName: file.name, vaults })
      const total = vaults.reduce((acc, v) => acc + v.items.length, 0)
      toast.success(`${total} entrée(s) prêtes à importer (${vaults.length} vault Proton)`)
    } catch (err) {
      if (err instanceof ProtonImportError) {
        setError({ message: err.message, hint: err.hint })
      } else {
        setError({
          message: err instanceof Error ? err.message : 'Erreur inconnue',
        })
      }
      setParsed(null)
    }
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) void onFile(f)
  }

  const onConfirmImport = async () => {
    if (!parsed) return
    const allItems = parsed.vaults.flatMap((v) => v.items)
    setImporting(true)
    try {
      const { ok, failed } = await onConfirm(allItems)
      if (failed > 0) {
        toast.error(`${ok} entrée(s) importée(s), ${failed} échec(s).`)
      } else {
        toast.success(`${ok} entrée(s) importée(s) avec succès.`)
      }
      onClose()
    } catch (err) {
      toast.error(`Import : ${err instanceof Error ? err.message : 'erreur'}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card className="border-2 border-brand-200 dark:border-brand-800/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-500" aria-hidden />
            Importer depuis Proton Pass
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer">
            <X className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <div className="p-6 flex flex-col gap-4">
        {!parsed && !error && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Dans Proton Pass &rarr; Settings &rarr; Export :{' '}
              <strong>CSV</strong> (export complet, celui que tu as déjà) ou{' '}
              <strong>JSON (unencrypted)</strong>. Le fichier ne quitte pas ton navigateur
              tant que tu n&apos;as pas confirmé l&apos;import.
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 flex flex-col items-center justify-center gap-2 hover:border-brand-400 dark:hover:border-brand-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500" aria-hidden />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Glisse un export Proton Pass <code className="font-mono">.csv</code> ou{' '}
                <code className="font-mono">.json</code> ici
              </p>
              <label className="cursor-pointer mt-2">
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onFile(f)
                  }}
                />
                <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  ou parcourir
                </span>
              </label>
            </div>
          </>
        )}
        {error && (
          <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden />
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-100">
                {error.message}
              </div>
              {error.hint && (
                <div className="mt-1 text-amber-800 dark:text-amber-200">{error.hint}</div>
              )}
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setParsed(null)
                }}
                className="mt-3 inline-flex items-center text-amber-700 dark:text-amber-300 hover:underline text-xs"
              >
                Choisir un autre fichier
              </button>
            </div>
          </div>
        )}
        {parsed && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="text-slate-900 dark:text-slate-100 font-medium">
                {parsed.fileName}
              </span>{' '}
              · {totalItems} entrée(s) sur {parsed.vaults.length} vault Proton
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-md max-h-72 overflow-auto">
              {parsed.vaults.map((v) => (
                <li key={v.vaultId} className="px-4 py-2.5">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {v.vaultName}{' '}
                    <span className="text-slate-400 dark:text-slate-500 font-normal">
                      · {v.items.length} entrée(s)
                    </span>
                  </div>
                  {v.items.length > 0 && (
                    <ul className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {v.items.slice(0, 3).map((i) => (
                        <li key={`${v.vaultId}-${i.source.itemId}`} className="truncate">
                          · {String((i.plaintext.fields as Record<string, unknown>).title)} (
                          {i.protonType})
                        </li>
                      ))}
                      {v.items.length > 3 && <li>· ... +{v.items.length - 3} autres</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-200">
              Toutes ces entrées seront importées dans le vault Cloudity{' '}
              <strong>{targetVaultName}</strong> (id #{targetVaultId}). Les types non
              gérés (cartes bancaires, alias…) deviennent des <em>notes</em> avec un
              dump structuré pour retraitement manuel.
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={importing}>
                Annuler
              </Button>
              <Button onClick={onConfirmImport} disabled={importing || totalItems === 0}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden />
                {importing ? 'Chiffrement + import…' : `Importer ${totalItems} entrée(s)`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
