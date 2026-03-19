const getBaseUrl = (): string => {
  const env = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
  let base = env?.VITE_API_URL ?? ''
  base = base ? `${base.replace(/\/$/, '')}` : ''
  return base
}

export function apiUrl(path: string): string {
  const base = getBaseUrl()
  const pathNorm = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${pathNorm}` : pathNorm
}

export type TenantResponse = {
  id: number
  name: string
  domain: string
  database_url: string
  is_active: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export async function fetchTenants(token: string): Promise<TenantResponse[]> {
  const url = apiUrl('/admin/tenants')
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Tenants: ${res.status}`)
  return res.json() as Promise<TenantResponse[]>
}

export type UserResponse = {
  id: number
  tenant_id: number
  email: string
  is_2fa_enabled: boolean
  is_active: boolean
  role: string
  last_login: string | null
  created_at: string
  updated_at: string | null
}

export type UserUpdatePayload = {
  is_active?: boolean
  role?: string
}

export async function fetchUsers(
  tenantId: number,
  token: string
): Promise<UserResponse[]> {
  const url = apiUrl(`/admin/tenants/${tenantId}/users`)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Users: ${res.status}`)
  return res.json() as Promise<UserResponse[]>
}

export async function updateUser(
  userId: number,
  payload: UserUpdatePayload,
  token: string
): Promise<UserResponse> {
  const url = apiUrl(`/admin/users/${userId}`)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Update user: ${res.status}`)
  return res.json() as Promise<UserResponse>
}

export type DashboardStatsResponse = {
  active_tenants: number
  total_users: number
  api_calls_today: number
}

export async function fetchDashboardStats(token: string): Promise<DashboardStatsResponse> {
  const url = apiUrl('/admin/stats')
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Stats: ${res.status}`)
  return res.json() as Promise<DashboardStatsResponse>
}

// Pass / Vaults (password-manager)
export type VaultResponse = {
  id: number
  user_id: number
  tenant_id: number
  name: string
  created_at: string
  updated_at: string
}

export type PassItemResponse = {
  id: number
  vault_id: number
  ciphertext: string
  created_at: string
  updated_at: string
}

export async function fetchVaults(token: string): Promise<VaultResponse[]> {
  const url = apiUrl('/pass/vaults')
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Vaults: ${res.status}`)
  return res.json() as Promise<VaultResponse[]>
}

export async function createVault(token: string, name: string): Promise<{ id: number; name: string }> {
  const url = apiUrl('/pass/vaults')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: name || 'Default' }),
  })
  if (!res.ok) throw new Error(`Create vault: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string }>
}

export async function fetchVaultItems(token: string, vaultId: number): Promise<PassItemResponse[]> {
  const url = apiUrl(`/pass/vaults/${vaultId}/items`)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Vault items: ${res.status}`)
  return res.json() as Promise<PassItemResponse[]>
}

// Mail / Domaines (mail-directory-service)
export type MailDomainResponse = {
  id: number
  tenant_id: number
  domain: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function fetchDomains(token: string): Promise<MailDomainResponse[]> {
  const url = apiUrl('/mail/domains')
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Domains: ${res.status}`)
  return res.json() as Promise<MailDomainResponse[]>
}

export async function createDomain(token: string, domain: string): Promise<{ id: number; domain: string }> {
  const url = apiUrl('/mail/domains')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain }),
  })
  if (!res.ok) throw new Error(`Create domain: ${res.status}`)
  return res.json() as Promise<{ id: number; domain: string }>
}

// Comptes mail reliés par l'utilisateur (user_email_accounts)
export type MailAccountResponse = {
  id: number
  user_id: number
  tenant_id: number
  email: string
  label?: string
  created_at: string
  updated_at: string
}

export async function fetchMailAccounts(token: string): Promise<MailAccountResponse[]> {
  const res = await fetch(apiUrl('/mail/me/accounts'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail accounts: ${res.status}`)
  return res.json() as Promise<MailAccountResponse[]>
}

export async function createMailAccount(
  token: string,
  email: string,
  options?: { label?: string; password?: string }
): Promise<{ id: number; email: string; label?: string }> {
  const body: { email: string; label?: string; password?: string } = {
    email: email.trim().toLowerCase(),
    label: options?.label?.trim() || '',
  }
  if (options?.password != null && options.password.trim() !== '') {
    body.password = options.password.trim()
  }
  const res = await fetch(apiUrl('/mail/me/accounts'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.status === 409) throw new Error('Cette adresse est déjà reliée')
  if (!res.ok) throw new Error(`Create mail account: ${res.status}`)
  return res.json() as Promise<{ id: number; email: string; label?: string }>
}

export async function deleteMailAccount(token: string, accountId: number): Promise<void> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Delete mail account: ${res.status}`)
}

export type MailMessageResponse = {
  id: number
  account_id: number
  folder: string
  from: string
  to: string
  subject: string
  date_at?: string
  created_at: string
  is_read?: boolean
}

export type MailMessageDetailResponse = MailMessageResponse & {
  body_plain?: string
  body_html?: string
}

export async function fetchMailMessages(
  token: string,
  accountId: number,
  folder = 'inbox',
  options?: { limit?: number; offset?: number }
): Promise<MailMessageResponse[]> {
  const params = new URLSearchParams({ folder })
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages?${params}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail messages: ${res.status}`)
  return res.json() as Promise<MailMessageResponse[]>
}

export async function fetchMailMessage(
  token: string,
  accountId: number,
  messageId: number
): Promise<MailMessageDetailResponse> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages/${messageId}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail message: ${res.status}`)
  return res.json() as Promise<MailMessageDetailResponse>
}

export async function markMailMessageRead(
  token: string,
  accountId: number,
  messageId: number,
  read: boolean
): Promise<{ ok: boolean; read: boolean }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages/${messageId}/read`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ read }),
  })
  if (!res.ok) throw new Error(`Mark read: ${res.status}`)
  return res.json() as Promise<{ ok: boolean; read: boolean }>
}

export type MailFolderId = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash'

export async function moveMailMessageToFolder(
  token: string,
  accountId: number,
  messageId: number,
  folder: MailFolderId
): Promise<{ ok: boolean; folder: string }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages/${messageId}/folder`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ folder }),
  })
  if (!res.ok) throw new Error(`Move message: ${res.status}`)
  return res.json() as Promise<{ ok: boolean; folder: string }>
}

/** Retourne l’URL de redirection OAuth Google pour connecter une boîte Gmail sans mot de passe d’application. */
export async function getMailGoogleOAuthRedirectUrl(token: string): Promise<{ redirect_url: string }> {
  const res = await fetch(apiUrl('/mail/me/oauth/google/authorize'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `OAuth: ${res.status}`)
    }
  }
  return res.json() as Promise<{ redirect_url: string }>
}

export async function syncMailAccount(
  token: string,
  accountId: number,
  password?: string,
  options?: { imap_host?: string; imap_port?: number }
): Promise<{ synced: number; message: string }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/sync`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: password ?? '',
      imap_host: options?.imap_host,
      imap_port: options?.imap_port,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `Sync: ${res.status}`)
    }
  }
  return res.json() as Promise<{ synced: number; message: string }>
}

export async function sendMailMessage(
  token: string,
  payload: {
    account_id: number
    password?: string
    to: string
    subject: string
    body: string
    smtp_host?: string
    smtp_port?: number
  }
): Promise<{ message: string }> {
  const res = await fetch(apiUrl('/mail/me/send'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `Send: ${res.status}`)
    }
  }
  return res.json() as Promise<{ message: string }>
}

export type LoginBody = { email: string; password: string; tenant_id?: number }
export type LoginResponse = {
  access_token: string
  refresh_token?: string
  requires_2fa?: boolean
}

export async function login(body: LoginBody): Promise<LoginResponse> {
  const url = apiUrl('/auth/login')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, tenant_id: String(body.tenant_id ?? 1) }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Login: ${res.status}`)
  }
  return res.json() as Promise<LoginResponse>
}

export type RefreshResponse = {
  access_token: string
  refresh_token: string
  expires_in?: number
}

/** Rafraîchit la session avec le refresh token (rotation côté serveur). À appeler avant expiration du access token. */
export async function refreshAuth(refreshToken: string): Promise<RefreshResponse> {
  const url = apiUrl('/auth/refresh')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Refresh: ${res.status}`)
  }
  return res.json() as Promise<RefreshResponse>
}

export type RegisterBody = { email: string; password: string; tenant_id?: number }
export type RegisterResponse = {
  access_token: string
  refresh_token?: string
  user_id?: string
  expires_in?: number
}

export async function register(body: RegisterBody): Promise<RegisterResponse> {
  const url = apiUrl('/auth/register')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, tenant_id: String(body.tenant_id ?? 1) }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Register: ${res.status}`)
  }
  return res.json() as Promise<RegisterResponse>
}

// Drive — dossiers et fichiers en cascade
export type DriveNode = {
  id: number
  tenant_id: number
  user_id: number
  parent_id: number | null
  name: string
  is_folder: boolean
  size: number
  mime_type?: string | null
  created_at: string
  updated_at: string
  /** Nombre d'éléments au 1er niveau (dossiers uniquement, renvoyé par l'API). */
  child_count?: number
  child_folders?: number
  child_files?: number
  /** Date de suppression (corbeille). */
  deleted_at?: string | null
}

export async function fetchDriveNodes(
  token: string,
  parentId: number | null
): Promise<DriveNode[]> {
  const base = apiUrl('/drive/nodes')
  const url = parentId == null ? base : `${base}?parent_id=${parentId}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive: ${res.status}`)
  return res.json() as Promise<DriveNode[]>
}

/** Liste les fichiers récemment modifiés (tous dossiers confondus). */
export async function fetchDriveRecentFiles(
  token: string,
  limit = 20
): Promise<DriveNode[]> {
  const res = await fetch(apiUrl(`/drive/nodes/recent?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive recent: ${res.status}`)
  return res.json() as Promise<DriveNode[]>
}

export async function createDriveFolder(
  token: string,
  parentId: number | null,
  name: string
): Promise<{ id: number; name: string; is_folder: boolean }> {
  const res = await fetch(apiUrl('/drive/nodes'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent_id: parentId, name, is_folder: true }),
  })
  if (res.status === 409) {
    try {
      const j = (await res.json()) as { id?: number; name?: string; is_folder?: boolean }
      if (typeof j?.id === 'number') {
        return { id: j.id, name: j.name ?? name, is_folder: true }
      }
    } catch {
      /* ignore */
    }
    throw new Error('Un dossier avec ce nom existe déjà')
  }
  if (!res.ok) throw new Error(`Create folder: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string; is_folder: boolean }>
}

/** Crée un fichier vide (nœud document) pour édition. En cas de nom déjà existant, le backend renvoie 409. */
export async function createDriveFile(
  token: string,
  parentId: number | null,
  name: string
): Promise<{ id: number; name: string; is_folder: boolean }> {
  const res = await fetch(apiUrl('/drive/nodes'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent_id: parentId, name, is_folder: false }),
  })
  if (res.status === 409) {
    const err = new Error('FILE_EXISTS') as Error & { status?: number }
    err.status = 409
    throw err
  }
  if (!res.ok) {
    let msg = `Création fichier: ${res.status}`
    let isConflict = false
    try {
      const j = await res.json() as { error?: string; message?: string; code?: string }
      if (j?.message) msg = j.message
      else if (j?.error) msg = j.error
      // Backend peut renvoyer 500 au lieu de 409 pour contrainte unique (ancienne image) : on traite comme 409 pour retry.
      isConflict = res.status === 500 && (
        j?.code === 'FILE_EXISTS' ||
        /duplicate|unique constraint|already exists|déjà exist/i.test(msg)
      )
    } catch { /* ignore */ }
    const err = new Error(msg) as Error & { status?: number }
    if (isConflict) err.status = 409
    throw err
  }
  return res.json() as Promise<{ id: number; name: string; is_folder: boolean }>
}

/** Regex pour extraire le numéro d'un nom "nom (n).ext" (n = 0 pour "nom.ext"). */
function parseNumberedName(name: string, nameBase: string, ext: string): number | null {
  if (name === nameBase + ext) return 0
  const re = new RegExp(`^${escapeRe(nameBase)} \\((\\d+)\\)${escapeRe(ext)}$`)
  const m = name.match(re)
  return m ? parseInt(m[1], 10) : null
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Crée un fichier avec un nom unique : récupère d'abord les noms existants, calcule le prochain libre, puis un seul POST. */
export async function createDriveFileWithUniqueName(
  token: string,
  parentId: number | null,
  baseName: string,
  _maxAttempts = 100
): Promise<{ id: number; name: string; is_folder: boolean }> {
  const lastDot = baseName.lastIndexOf('.')
  const nameBase = lastDot >= 0 ? baseName.slice(0, lastDot) : baseName
  const ext = lastDot >= 0 ? baseName.slice(lastDot) : ''
  const existing = await fetchDriveNodes(token, parentId)
  const used = new Set<number>()
  for (const n of existing) {
    if (n.is_folder) continue
    const num = parseNumberedName(n.name, nameBase, ext)
    if (num !== null) used.add(num)
  }
  let i = 0
  while (used.has(i)) i++
  const name = i === 0 ? baseName : `${nameBase} (${i})${ext}`
  return createDriveFile(token, parentId, name)
}

export async function renameDriveNode(
  token: string,
  id: number,
  name: string
): Promise<{ id: number; name: string }> {
  const res = await fetch(apiUrl(`/drive/nodes/${id}`), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Rename: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string }>
}

/** Déplace un nœud (dossier ou fichier) vers un autre dossier. parentId = 0 ou null pour la racine. */
export async function moveDriveNode(
  token: string,
  nodeId: number,
  parentId: number | null
): Promise<{ id: number; name: string; parent_id: number | null }> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}`), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent_id: parentId === null || parentId === 0 ? 0 : parentId }),
  })
  if (!res.ok) throw new Error(`Move: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string; parent_id: number | null }>
}

/** Suppression (soft delete) : déplace en corbeille. */
export async function deleteDriveNode(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/drive/nodes/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Delete: ${res.status}`)
}

/** Liste les nœuds en corbeille. */
export async function fetchDriveTrash(token: string): Promise<DriveNode[]> {
  const res = await fetch(apiUrl('/drive/nodes/trash'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Trash: ${res.status}`)
  return res.json() as Promise<DriveNode[]>
}

/** Restaure un nœud depuis la corbeille. */
export async function restoreDriveNode(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/drive/nodes/${id}/restore`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Restore: ${res.status}`)
}

/** Supprime définitivement un nœud (corbeille uniquement). */
export async function purgeDriveNode(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/drive/nodes/trash/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Purge: ${res.status}`)
}

export async function downloadDriveFile(
  token: string,
  nodeId: number
): Promise<Blob> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/content`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download: ${res.status}`)
  return res.blob()
}

/** Télécharge un dossier entier en ZIP (pas de .zip dans l’UI, juste « Télécharger »). */
export async function downloadDriveFolderAsZip(
  token: string,
  folderId: number
): Promise<Blob> {
  const res = await fetch(apiUrl(`/drive/nodes/${folderId}/zip`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download folder: ${res.status}`)
  return res.blob()
}

export type DriveZipEntry = { path: string; name: string; size: number; is_dir: boolean }

/** Liste les entrées d'un fichier ZIP (sans extraire). */
export async function fetchDriveZipEntries(
  token: string,
  nodeId: number
): Promise<DriveZipEntry[]> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/archive/entries`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Zip entries: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data.entries) ? data.entries : []
}

/** Crée une archive ZIP à partir des nœuds sélectionnés (fichiers + dossiers). */
export async function downloadDriveArchive(
  token: string,
  nodeIds: number[]
): Promise<Blob> {
  const res = await fetch(apiUrl('/drive/nodes/archive'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ node_ids: nodeIds }),
  })
  if (!res.ok) throw new Error(`Archive: ${res.status}`)
  return res.blob()
}

/** Récupère le contenu d'un nœud en texte (pour l'éditeur). */
export async function getDriveNodeContentAsText(
  token: string,
  nodeId: number
): Promise<string> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/content`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Content: ${res.status}`)
  return res.text()
}

/** Met à jour le contenu d'un nœud fichier (éditeur maison). */
export async function putDriveNodeContent(
  token: string,
  nodeId: number,
  content: string,
  mimeType = 'text/plain'
): Promise<{ id: number; size: number }> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/content`), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: content,
  })
  if (!res.ok) throw new Error(`Save content: ${res.status}`)
  return res.json() as Promise<{ id: number; size: number }>
}

/** Enregistre le contenu binaire d'un nœud (ex. .docx, .xlsx). */
export async function putDriveNodeContentBlob(
  token: string,
  nodeId: number,
  blob: Blob,
  mimeType: string
): Promise<{ id: number; size: number }> {
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/content`), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: blob,
  })
  if (!res.ok) throw new Error(`Save content: ${res.status}`)
  return res.json() as Promise<{ id: number; size: number }>
}

export async function uploadDriveFile(
  token: string,
  parentId: number | null,
  file: File
): Promise<{ id: number; name: string; size: number }> {
  return uploadDriveFileWithProgress(token, parentId, file)
}

/** Upload avec rapport de progression (XHR). Si overwrite est true, remplace un fichier existant de même nom. */
export function uploadDriveFileWithProgress(
  token: string,
  parentId: number | null,
  file: File,
  onProgress?: (percent: number) => void,
  overwrite?: boolean
): Promise<{ id: number; name: string; size: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name)
    if (parentId != null) form.append('parent_id', String(parentId))
    if (overwrite) form.append('overwrite', 'true')

    const xhr = new XMLHttpRequest()
    const timeout = 120_000
    const timeoutId = setTimeout(() => {
      xhr.abort()
    }, timeout)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      clearTimeout(timeoutId)
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as { id: number; name: string; size: number }
          resolve(json)
        } catch {
          reject(new Error(`Upload: ${xhr.status}`))
        }
        return
      }
      if (xhr.status === 409) {
        try {
          const json = JSON.parse(xhr.responseText) as { code?: string; message?: string }
          if (json.code === 'FILE_EXISTS') {
            const e = new Error(json.message || 'Un fichier avec ce nom existe déjà') as Error & { code: string }
            e.code = 'FILE_EXISTS'
            reject(e)
            return
          }
        } catch {
          // fallback
        }
      }
      reject(new Error(xhr.responseText ? `Upload: ${xhr.status} - ${xhr.responseText}` : `Upload: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => {
      clearTimeout(timeoutId)
      reject(new Error('Upload: network error'))
    })
    xhr.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      reject(new Error('Upload: aborted'))
    })

    xhr.open('POST', apiUrl('/drive/nodes/upload'))
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(form)
  })
}

// Calendar — événements
export type CalendarEvent = {
  id: number
  tenant_id: number
  user_id: number
  title: string
  start_at: string
  end_at: string
  all_day: boolean
  location?: string | null
  description?: string | null
  created_at: string
  updated_at: string
}

export async function fetchCalendarEvents(token: string): Promise<CalendarEvent[]> {
  const res = await fetch(apiUrl('/calendar/events'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Calendar: ${res.status}`)
  return res.json() as Promise<CalendarEvent[]>
}

export async function createCalendarEvent(
  token: string,
  data: { title: string; start_at: string; end_at: string; all_day?: boolean; location?: string; description?: string }
): Promise<{ id: number; title: string }> {
  const res = await fetch(apiUrl('/calendar/events'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Create event: ${res.status}`)
  return res.json() as Promise<{ id: number; title: string }>
}

// Notes — bloc-notes
export type Note = {
  id: number
  tenant_id: number
  user_id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export async function fetchNotes(token: string): Promise<Note[]> {
  const res = await fetch(apiUrl('/notes'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Notes: ${res.status}`)
  return res.json() as Promise<Note[]>
}

export async function createNote(token: string, title: string, content: string): Promise<{ id: number; title: string }> {
  const res = await fetch(apiUrl('/notes'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  })
  if (!res.ok) throw new Error(`Create note: ${res.status}`)
  return res.json() as Promise<{ id: number; title: string }>
}

// Tasks — listes et tâches
export type TaskList = { id: number; tenant_id: number; user_id: number; name: string; created_at: string; updated_at: string }
export type Task = {
  id: number
  tenant_id: number
  user_id: number
  list_id?: number | null
  title: string
  completed: boolean
  due_at?: string | null
  created_at: string
  updated_at: string
}

export async function fetchTaskLists(token: string): Promise<TaskList[]> {
  const res = await fetch(apiUrl('/tasks/lists'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Task lists: ${res.status}`)
  return res.json() as Promise<TaskList[]>
}

export async function fetchTasks(token: string, listId?: number | null): Promise<Task[]> {
  const url = listId != null ? `${apiUrl('/tasks')}?list_id=${listId}` : apiUrl('/tasks')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Tasks: ${res.status}`)
  return res.json() as Promise<Task[]>
}

export async function createTask(token: string, title: string, listId?: number | null): Promise<{ id: number; title: string }> {
  const res = await fetch(apiUrl('/tasks'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, list_id: listId ?? undefined }),
  })
  if (!res.ok) throw new Error(`Create task: ${res.status}`)
  return res.json() as Promise<{ id: number; title: string }>
}

// Contacts — carnet d'adresses (suggestions Mail, etc.)
export type ContactResponse = {
  id: number
  tenant_id: number
  user_id: number
  name: string
  email: string
  phone?: string
  created_at: string
  updated_at: string
}

export async function fetchContacts(token: string): Promise<ContactResponse[]> {
  const res = await fetch(apiUrl('/contacts'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Contacts: ${res.status}`)
  return res.json() as Promise<ContactResponse[]>
}

export async function createContact(
  token: string,
  payload: { name?: string; email: string; phone?: string }
): Promise<{ id: number; name: string; email: string }> {
  const res = await fetch(apiUrl('/contacts'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `Create contact: ${res.status}`)
    }
  }
  return res.json() as Promise<{ id: number; name: string; email: string }>
}

export async function updateContact(
  token: string,
  id: number,
  payload: { name?: string; email?: string; phone?: string }
): Promise<{ id: number }> {
  const res = await fetch(apiUrl(`/contacts/${id}`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Update contact: ${res.status}`)
  return res.json() as Promise<{ id: number }>
}

export async function deleteContact(token: string, id: number): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl(`/contacts/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Delete contact: ${res.status}`)
  return res.json() as Promise<{ ok: boolean }>
}

export async function updateTaskCompleted(token: string, id: number, completed: boolean): Promise<void> {
  const res = await fetch(apiUrl(`/tasks/${id}`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  })
  if (!res.ok) throw new Error(`Update task: ${res.status}`)
}
