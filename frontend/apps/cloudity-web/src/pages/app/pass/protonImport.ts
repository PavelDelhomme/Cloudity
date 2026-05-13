/**
 * Importeur **Proton Pass JSON export** → items Cloudity Pass (`ItemPlaintextV1`).
 *
 * Format d'export (Proton Pass v1.x, exporté en clair via Settings → Export → JSON) :
 *
 * ```jsonc
 * {
 *   "version": "1.x.x",
 *   "userId": "...",
 *   "encrypted": false,
 *   "vaults": {
 *     "<vault-uuid>": {
 *       "name": "Personal",
 *       "description": "...",
 *       "items": [
 *         {
 *           "itemId": "<uuid>",
 *           "data": {
 *             "type": "login",        // login / note / alias / ...
 *             "metadata": {
 *               "name": "Acme Corp",
 *               "note": "Notes libres"
 *             },
 *             "content": {
 *               "username": "user@example.org",
 *               "password": "...",
 *               "urls": ["https://acme.example/login"],
 *               "totpUri": "otpauth://totp/Acme:user?...",
 *               "passkeys": []
 *             },
 *             "extraFields": [
 *               { "fieldName": "PIN", "type": "text", "data": { "content": "1234" } },
 *               { "fieldName": "Recovery", "type": "hidden", "data": { "content": "..." } }
 *             ]
 *           }
 *         }
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * On reste **tolérant** aux variations du format (Proton change parfois la
 * structure entre versions mineures), tout en refusant le contenu chiffré
 * (`encrypted: true`) — l'utilisateur doit ré-exporter en clair via
 * « Export as JSON unencrypted ».
 */

import type { ItemPlaintextV1 } from '@cloudity/pass-crypto'

// --- Types Proton (subset) ---------------------------------------------

export interface ProtonExport {
  version?: string
  userId?: string
  encrypted: boolean
  vaults: Record<string, ProtonVault>
}

export interface ProtonVault {
  name: string
  description?: string
  items: ProtonItem[]
}

export interface ProtonItem {
  itemId: string
  data: ProtonItemData
}

export interface ProtonItemData {
  type: string
  metadata?: { name?: string; note?: string }
  content?: Record<string, unknown>
  extraFields?: ProtonExtraField[]
}

export interface ProtonExtraField {
  fieldName: string
  type?: string
  data?: { content?: string }
}

// --- Erreur typée ------------------------------------------------------

export class ProtonImportError extends Error {
  constructor(
    message: string,
    public readonly hint?: string
  ) {
    super(message)
    this.name = 'ProtonImportError'
  }
}

// --- Parse JSON --------------------------------------------------------

export function parseProtonExport(rawJson: string): ProtonExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (err) {
    throw new ProtonImportError(
      'Fichier JSON invalide.',
      err instanceof Error ? err.message : undefined
    )
  }
  if (!isRecord(parsed)) {
    throw new ProtonImportError('Format inattendu : racine non-objet.')
  }
  if (parsed.encrypted === true) {
    throw new ProtonImportError(
      'Export Proton chiffré.',
      'Re-fais l\'export depuis Proton Pass en mode "JSON unencrypted" — Cloudity ne déchiffre pas le format Proton.'
    )
  }
  if (!isRecord(parsed.vaults)) {
    throw new ProtonImportError(
      "Aucun champ 'vaults' trouvé.",
      "Le fichier ne ressemble pas à un export Proton Pass JSON."
    )
  }
  const vaults: Record<string, ProtonVault> = {}
  for (const [vaultId, raw] of Object.entries(parsed.vaults)) {
    if (!isRecord(raw)) continue
    const items: ProtonItem[] = []
    if (Array.isArray(raw.items)) {
      for (const it of raw.items) {
        if (!isRecord(it) || !isRecord(it.data)) continue
        items.push({
          itemId: typeof it.itemId === 'string' ? it.itemId : crypto.randomUUID(),
          data: {
            type: typeof it.data.type === 'string' ? it.data.type : 'unknown',
            metadata: isRecord(it.data.metadata)
              ? {
                  name:
                    typeof it.data.metadata.name === 'string'
                      ? it.data.metadata.name
                      : undefined,
                  note:
                    typeof it.data.metadata.note === 'string'
                      ? it.data.metadata.note
                      : undefined,
                }
              : undefined,
            content: isRecord(it.data.content) ? it.data.content : undefined,
            extraFields: Array.isArray(it.data.extraFields)
              ? (it.data.extraFields.filter(isRecord) as ProtonExtraField[])
              : undefined,
          },
        })
      }
    }
    vaults[vaultId] = {
      name: typeof raw.name === 'string' ? raw.name : 'Importé',
      description: typeof raw.description === 'string' ? raw.description : undefined,
      items,
    }
  }
  return {
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
    userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
    encrypted: false,
    vaults,
  }
}

// --- Conversion vers Cloudity ----------------------------------------

export interface ConvertedItem {
  /** Source — utilisé uniquement pour les logs (pas chiffré). */
  source: { vaultId: string; itemId: string }
  plaintext: ItemPlaintextV1
  /** Type d'origine Proton (login / note / alias / unknown). */
  protonType: string
}

/**
 * Convertit chaque item Proton en `ItemPlaintextV1` Cloudity. Les types
 * non supportés (alias, identité, carte bleue) sont stockés en `note`
 * avec un dump structuré dans `notes` — l'utilisateur les retravaillera
 * manuellement après migration.
 */
export function convertProtonToCloudity(
  exp: ProtonExport
): { vaultId: string; vaultName: string; items: ConvertedItem[] }[] {
  const out: { vaultId: string; vaultName: string; items: ConvertedItem[] }[] = []
  for (const [vaultId, vault] of Object.entries(exp.vaults)) {
    const converted: ConvertedItem[] = []
    for (const it of vault.items) {
      converted.push({
        source: { vaultId, itemId: it.itemId },
        protonType: it.data.type,
        plaintext: convertOneItem(it),
      })
    }
    out.push({ vaultId, vaultName: vault.name, items: converted })
  }
  return out
}

function convertOneItem(it: ProtonItem): ItemPlaintextV1 {
  const m = it.data.metadata ?? {}
  const c = (it.data.content ?? {}) as Record<string, unknown>
  const title = m.name && m.name.trim() ? m.name.trim() : 'Sans titre'
  const baseFields: Record<string, unknown> = { title }
  let type: ItemPlaintextV1['type'] = 'login'

  if (it.data.type === 'login') {
    type = 'login'
    if (typeof c.username === 'string') baseFields.username = c.username
    if (typeof c.password === 'string') baseFields.password = c.password
    const urls = c.urls
    if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === 'string') {
      baseFields.url = String(urls[0])
      // Si plusieurs URL, on garde la première en `url` et on dump le reste en notes.
    }
    if (typeof c.totpUri === 'string' && c.totpUri.trim()) {
      baseFields.totpUri = c.totpUri.trim()
    }
  } else if (it.data.type === 'note') {
    type = 'note'
  } else {
    // alias, identity, creditCard, ssh, etc. → on tag en note avec dump structuré
    type = 'note'
    baseFields.protonOriginalType = it.data.type
  }

  const extras = (it.data.extraFields ?? [])
    .filter((f) => f.fieldName && f.data?.content)
    .map((f) => `${f.fieldName} (${f.type ?? 'text'}): ${f.data?.content ?? ''}`)
    .join('\n')

  const noteParts: string[] = []
  if (m.note && m.note.trim()) noteParts.push(m.note.trim())
  if (Array.isArray(c.urls) && c.urls.length > 1) {
    noteParts.push(`URLs additionnelles : ${c.urls.slice(1).join(', ')}`)
  }
  if (extras) noteParts.push(`Champs additionnels :\n${extras}`)
  if (it.data.type !== 'login' && it.data.type !== 'note') {
    noteParts.push(
      `Type d'origine Proton non géré : ${it.data.type}. ` +
        `Dump du contenu : ${JSON.stringify(c)}`
    )
  }

  const plaintext: ItemPlaintextV1 = {
    schema: 1,
    type,
    fields: baseFields,
  }
  if (noteParts.length) plaintext.notes = noteParts.join('\n\n')
  return plaintext
}

// --- Helpers ---------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
