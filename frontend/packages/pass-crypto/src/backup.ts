/**
 * Format de sauvegarde Cloudity Pass v1 — blobs chiffrés uniquement (zero-access).
 * Spec : docs/produit/PASS-BACKUP.md
 */

export const PASS_BACKUP_SCHEMA = 'cloudity-pass-backup-v1' as const

export type PassBackupItemV1 = {
  id: number
  ciphertext: string
  format_version: number
  created_at?: string
  updated_at?: string
}

export type PassBackupVaultV1 = {
  id: number
  name: string
  created_at?: string
  updated_at?: string
  items: PassBackupItemV1[]
}

export type PassBackupV1 = {
  schema: typeof PASS_BACKUP_SCHEMA
  exported_at: string
  user_id: string
  app: 'cloudity-pass'
  vaults: PassBackupVaultV1[]
}

export function buildPassBackupV1(input: {
  userId: string
  vaults: Array<{
    id: number
    name: string
    created_at?: string
    updated_at?: string
    items: Array<{
      id: number
      ciphertext: string
      format_version?: number
      created_at?: string
      updated_at?: string
    }>
  }>
}): PassBackupV1 {
  return {
    schema: PASS_BACKUP_SCHEMA,
    exported_at: new Date().toISOString(),
    user_id: String(input.userId),
    app: 'cloudity-pass',
    vaults: input.vaults.map((v) => ({
      id: v.id,
      name: v.name,
      created_at: v.created_at,
      updated_at: v.updated_at,
      items: v.items.map((it) => ({
        id: it.id,
        ciphertext: it.ciphertext,
        format_version: it.format_version ?? 1,
        created_at: it.created_at,
        updated_at: it.updated_at,
      })),
    })),
  }
}

export function parsePassBackupJson(raw: unknown): PassBackupV1 {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('Sauvegarde invalide : JSON attendu')
  }
  const o = raw as Record<string, unknown>
  if (o.schema !== PASS_BACKUP_SCHEMA) {
    throw new Error(`Sauvegarde invalide : schema attendu ${PASS_BACKUP_SCHEMA}`)
  }
  if (typeof o.user_id !== 'string' || !o.user_id.trim()) {
    throw new Error('Sauvegarde invalide : user_id manquant')
  }
  if (!Array.isArray(o.vaults)) {
    throw new Error('Sauvegarde invalide : vaults manquant')
  }
  const vaults: PassBackupVaultV1[] = o.vaults.map((v, vi) => {
    if (v == null || typeof v !== 'object') {
      throw new Error(`Sauvegarde invalide : coffre #${vi}`)
    }
    const vault = v as Record<string, unknown>
    const id = vault.id
    const name = vault.name
    if (typeof id !== 'number' || !Number.isFinite(id)) {
      throw new Error(`Sauvegarde invalide : id coffre #${vi}`)
    }
    if (typeof name !== 'string') {
      throw new Error(`Sauvegarde invalide : nom coffre #${vi}`)
    }
    if (!Array.isArray(vault.items)) {
      throw new Error(`Sauvegarde invalide : items coffre ${name}`)
    }
    const items: PassBackupItemV1[] = vault.items.map((it, ii) => {
      if (it == null || typeof it !== 'object') {
        throw new Error(`Sauvegarde invalide : item #${ii} coffre ${name}`)
      }
      const item = it as Record<string, unknown>
      if (typeof item.id !== 'number' || typeof item.ciphertext !== 'string' || !item.ciphertext) {
        throw new Error(`Sauvegarde invalide : item #${ii} coffre ${name}`)
      }
      const fv = item.format_version
      if (fv != null && typeof fv !== 'number') {
        throw new Error(`Sauvegarde invalide : format_version item #${ii}`)
      }
      return {
        id: item.id,
        ciphertext: item.ciphertext,
        format_version: typeof fv === 'number' ? fv : 1,
        created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
        updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
      }
    })
    return {
      id,
      name,
      created_at: typeof vault.created_at === 'string' ? vault.created_at : undefined,
      updated_at: typeof vault.updated_at === 'string' ? vault.updated_at : undefined,
      items,
    }
  })
  return {
    schema: PASS_BACKUP_SCHEMA,
    exported_at: typeof o.exported_at === 'string' ? o.exported_at : new Date(0).toISOString(),
    user_id: o.user_id.trim(),
    app: 'cloudity-pass',
    vaults,
  }
}

export function passBackupStats(backup: PassBackupV1): { vaultCount: number; itemCount: number } {
  let itemCount = 0
  for (const v of backup.vaults) itemCount += v.items.length
  return { vaultCount: backup.vaults.length, itemCount }
}
