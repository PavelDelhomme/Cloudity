/**
 * Export / import sauvegarde Cloudity Pass (fichier JSON chiffré côté client).
 * Cf. docs/produit/PASS-BACKUP.md
 */

import {
  buildPassBackupV1,
  parsePassBackupJson,
  passBackupStats,
  type PassBackupV1,
} from '@cloudity/pass-crypto'
import {
  createVault,
  createVaultItem,
  fetchVaultItems,
  fetchVaults,
  type PassItemResponse,
  type VaultResponse,
} from '../../../api'

export type PassBackupExportResult = {
  backup: PassBackupV1
  filename: string
  stats: { vaultCount: number; itemCount: number }
}

export async function exportPassBackup(
  token: string,
  userId: string
): Promise<PassBackupExportResult> {
  const vaults = await fetchVaults(token)
  const withItems = await Promise.all(
    vaults.map(async (v) => {
      const items = await fetchVaultItems(token, v.id)
      return { vault: v, items }
    })
  )
  const backup = buildPassBackupV1({
    userId,
    vaults: withItems.map(({ vault, items }) => ({
      id: vault.id,
      name: vault.name,
      created_at: vault.created_at,
      updated_at: vault.updated_at,
      items: items.map((it) => ({
        id: it.id,
        ciphertext: it.ciphertext,
        format_version: 1,
        created_at: it.created_at,
        updated_at: it.updated_at,
      })),
    })),
  })
  const stamp = backup.exported_at.slice(0, 19).replace(/[:T]/g, '-')
  return {
    backup,
    filename: `cloudity-pass-backup-${stamp}.json`,
    stats: passBackupStats(backup),
  }
}

export function downloadPassBackupFile(backup: PassBackupV1, filename: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readPassBackupFile(file: File): Promise<PassBackupV1> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('Fichier JSON invalide')
  }
  return parsePassBackupJson(raw)
}

export type PassBackupImportResult = {
  vaultsCreated: number
  itemsImported: number
  itemsSkipped: number
}

/** Restaure une sauvegarde vers le cloud (POST items manquants). */
export async function importPassBackup(
  token: string,
  backup: PassBackupV1,
  options?: { targetUserId?: string }
): Promise<PassBackupImportResult> {
  if (options?.targetUserId && options.targetUserId !== backup.user_id) {
    throw new Error(
      `Cette sauvegarde appartient au user ${backup.user_id} — connectez-vous avec le même compte.`
    )
  }
  const existingVaults = await fetchVaults(token)
  const vaultById = new Map<number, VaultResponse>(existingVaults.map((v) => [v.id, v]))
  const vaultByName = new Map<string, VaultResponse>(
    existingVaults.map((v) => [v.name.trim().toLowerCase(), v])
  )

  let vaultsCreated = 0
  let itemsImported = 0
  let itemsSkipped = 0

  for (const bv of backup.vaults) {
    let target = vaultById.get(bv.id) ?? vaultByName.get(bv.name.trim().toLowerCase())
    if (!target) {
      const created = await createVault(token, bv.name || 'Restauré')
      target = {
        id: created.id,
        user_id: 0,
        tenant_id: 0,
        name: created.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      vaultById.set(target.id, target)
      vaultByName.set(target.name.trim().toLowerCase(), target)
      vaultsCreated += 1
    }

    const existingItems = await fetchVaultItems(token, target.id)
    const knownCiphertext = new Set(existingItems.map((it) => it.ciphertext))

    for (const bi of bv.items) {
      if (!bi.ciphertext || knownCiphertext.has(bi.ciphertext)) {
        itemsSkipped += 1
        continue
      }
      await createVaultItem(token, target.id, bi.ciphertext, bi.format_version ?? 1)
      knownCiphertext.add(bi.ciphertext)
      itemsImported += 1
    }
  }

  return { vaultsCreated, itemsImported, itemsSkipped }
}

export function passBackupSummary(backup: PassBackupV1): string {
  const { vaultCount, itemCount } = passBackupStats(backup)
  return `${vaultCount} coffre(s), ${itemCount} entrée(s) — export ${backup.exported_at}`
}

export type { PassBackupV1, PassItemResponse, VaultResponse }
