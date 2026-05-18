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
 *
 * **Export CSV** (Settings → Export → CSV) : pris en charge via
 * `parseProtonCsvExport` / `parseProtonImportFile` (colonnes Proton
 * `type,name,url,email,username,password,note,totp,…,vault`).
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

// --- Détection format + point d'entrée ---------------------------------

/** JSON Proton ou CSV Proton (export complet). */
export function parseProtonImportFile(raw: string, fileName?: string): ProtonExport {
  const text = raw.replace(/^\uFEFF/, '')
  const head = text.trimStart().slice(0, 120)
  const csvByName = (fileName ?? '').toLowerCase().endsWith('.csv')
  const csvByHeader = head.startsWith('type,name,') || head.startsWith('type,name\r')

  if (csvByName || csvByHeader) {
    if (!text.trimStart().startsWith('{')) {
      return parseProtonCsvExport(text)
    }
  }

  if (text.trimStart().startsWith('{')) {
    return parseProtonExport(text)
  }

  if (csvByHeader) {
    return parseProtonCsvExport(text)
  }

  try {
    return parseProtonExport(text)
  } catch (err) {
    if (
      err instanceof ProtonImportError &&
      (text.includes('type,name,url,email') || csvByName)
    ) {
      return parseProtonCsvExport(text)
    }
    throw err
  }
}

// --- Parse CSV (export Proton Pass complet) ----------------------------

/** Parse RFC 4180 (guillemets, retours ligne dans les champs). */
export function parseCsvRecords(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = raw.replace(/^\uFEFF/, '')

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (c === '\r') {
      if (s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export function parseProtonCsvExport(rawCsv: string): ProtonExport {
  const records = parseCsvRecords(rawCsv)
  if (records.length < 2) {
    throw new ProtonImportError(
      'Fichier CSV vide ou incomplet.',
      'Exporte depuis Proton Pass → Settings → Export → CSV (export complet).'
    )
  }
  const header = records[0].map((h) => h.trim().toLowerCase())
  if (header[0] !== 'type' || !header.includes('vault')) {
    throw new ProtonImportError(
      'En-tête CSV Proton introuvable.',
      'La première ligne doit commencer par type,name,url,…,vault (export Proton Pass).'
    )
  }
  const col = (name: string): number => header.indexOf(name)

  const vaults: Record<string, ProtonVault> = {}
  let rowIndex = 0

  for (let r = 1; r < records.length; r++) {
    const cells = records[r]
    if (cells.length < 2) continue
    const get = (name: string): string => {
      const i = col(name)
      return i >= 0 && i < cells.length ? cells[i].trim() : ''
    }
    const type = get('type')
    if (!type) continue

    const vaultName = get('vault') || 'Importé'
    const vaultId = `csv-vault-${vaultName.replace(/\s+/g, '-').toLowerCase()}`
    if (!vaults[vaultId]) {
      vaults[vaultId] = { name: vaultName, items: [] }
    }

    const name = get('name')
    const urlRaw = get('url')
    const email = get('email')
    const username = get('username')
    const password = get('password')
    const note = get('note')
    const totp = get('totp')
    const loginUser = email || username

    const urls = urlRaw
      ? urlRaw
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean)
      : []

    const content: Record<string, unknown> = {}
    if (type === 'login') {
      if (loginUser) content.username = loginUser
      if (password) content.password = password
      if (urls.length) content.urls = urls
      if (totp) content.totpUri = totp
    } else if (type === 'alias') {
      content.aliasEmail = email || name
    } else if (note && (type === 'identity' || type === 'creditCard')) {
      content.raw = note
    }

    rowIndex++
    vaults[vaultId].items.push({
      itemId: `csv-${rowIndex}-${crypto.randomUUID()}`,
      data: {
        type,
        metadata: {
          name: name || email || username || 'Sans titre',
          note: note || undefined,
        },
        content: Object.keys(content).length ? content : undefined,
      },
    })
  }

  const total = Object.values(vaults).reduce((n, v) => n + v.items.length, 0)
  if (total === 0) {
    throw new ProtonImportError(
      'Aucune entrée lisible dans le CSV.',
      'Vérifie que le fichier est bien un export Proton Pass (pas un autre tableur).'
    )
  }

  return {
    version: 'csv-export',
    encrypted: false,
    vaults,
  }
}

// --- Parse JSON --------------------------------------------------------

export function parseProtonExport(rawJson: string): ProtonExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (err) {
    const hint =
      rawJson.trimStart().startsWith('type,name,') ||
      rawJson.includes('type,name,url,email')
        ? 'Tu as peut‑être choisi un export CSV : le fichier est accepté (.csv) — réessaie avec le même fichier ou utilise parseProtonImportFile.'
        : err instanceof Error
          ? err.message
          : undefined
    throw new ProtonImportError('Fichier JSON invalide.', hint)
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
  if (it.data.type === 'alias' && typeof c.aliasEmail === 'string') {
    noteParts.push(`Adresse alias Proton : ${c.aliasEmail}`)
  }
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
