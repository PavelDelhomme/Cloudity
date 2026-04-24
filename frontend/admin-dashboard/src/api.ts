import { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY } from './lib/cloudityCore'

export { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY }

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
  // IMAP/SMTP (override) : null/undefined => détection automatique.
  imap_host?: string | null
  imap_port?: number | null
  smtp_host?: string | null
  smtp_port?: number | null
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
  if (res.ok) return
  const t = await res.text()
  let msg = t
  try {
    const j = JSON.parse(t) as { error?: string }
    if (j.error) msg = j.error
  } catch {
    /* ignore */
  }
  throw new Error(msg || `Suppression boîte mail: ${res.status}`)
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
  /** 0–100 : heuristique anti-spam (backend). */
  spam_score?: number
  /** Clé de regroupement conversation (Message-ID racine / References). */
  thread_key?: string
  attachment_count?: number
  /** Identifiants d’étiquettes (compte courant). */
  tag_ids?: number[]
}

export type MailAttachmentDTO = {
  id: number
  filename: string
  content_type: string
  size_bytes: number
  /** Contenu présent en base (sinon téléchargement relit l’IMAP). */
  stored_inline: boolean
}

export type MailMessageDetailResponse = MailMessageResponse & {
  body_plain?: string
  body_html?: string
  /** Bloc d’en-têtes MIME (RFC822) tel que stocké côté serveur ; optionnel selon version / synchro. */
  raw_headers?: string
  attachments?: MailAttachmentDTO[]
}

export type MailMessagesPageResponse = {
  messages: MailMessageResponse[]
  total: number
}

export async function fetchMailMessages(
  token: string,
  accountId: number,
  folder = 'inbox',
  options?: {
    limit?: number
    offset?: number
    recipient?: string
    delivered_to?: string
    /** Filtre messages portant cette étiquette (compte courant). */
    tag_id?: number
    /** Ne garder que les messages de cette conversation (même clé thread côté serveur). */
    thread_key?: string
  }
): Promise<MailMessagesPageResponse> {
  const params = new URLSearchParams({ folder })
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.delivered_to?.trim()) params.set('delivered_to', options.delivered_to.trim())
  else if (options?.recipient?.trim()) params.set('recipient', options.recipient.trim())
  if (options?.tag_id != null && options.tag_id > 0) params.set('tag_id', String(options.tag_id))
  if (options?.thread_key?.trim()) params.set('thread_key', options.thread_key.trim())
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages?${params}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail messages: ${res.status}`)
  const data = (await res.json()) as MailMessageResponse[] | MailMessagesPageResponse
  if (Array.isArray(data)) {
    return { messages: data, total: data.length }
  }
  const messages = Array.isArray(data.messages) ? data.messages : []
  const total = typeof data.total === 'number' ? data.total : messages.length
  return { messages, total }
}

/** Liste agrégée : toutes les boîtes du compte Cloudity (exclut corbeille, spam, brouillons — comme `folder=all` par boîte). */
export async function fetchUnifiedMailMessages(
  token: string,
  options?: {
    limit?: number
    offset?: number
    recipient?: string
    delivered_to?: string
    thread_key?: string
  }
): Promise<MailMessagesPageResponse> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.delivered_to?.trim()) params.set('delivered_to', options.delivered_to.trim())
  else if (options?.recipient?.trim()) params.set('recipient', options.recipient.trim())
  if (options?.thread_key?.trim()) params.set('thread_key', options.thread_key.trim())
  const q = params.toString()
  const res = await fetch(apiUrl(`/mail/me/messages/unified${q ? `?${q}` : ''}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail messages unifiés: ${res.status}`)
  const data = (await res.json()) as MailMessagesPageResponse
  const messages = Array.isArray(data.messages) ? data.messages : []
  const total = typeof data.total === 'number' ? data.total : messages.length
  return { messages, total }
}

export type MailAccountUpdatePayload = {
  label?: string
  password?: string
  imap_host?: string
  imap_port?: number
  smtp_host?: string
  smtp_port?: number
}

/** Met à jour libellé, mot de passe, serveurs IMAP/SMTP (sauvegardés en base pour sync et envoi). */
export async function updateMailAccount(
  token: string,
  accountId: number,
  patch: MailAccountUpdatePayload
): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Update mail account: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean }>
}

export type MailAliasResponse = {
  id: number
  account_id: number
  alias_email: string
  label?: string | null
  /** Cible de livraison / routage documenté (Pass, transfert — non appliqué seul sans config DNS / fournisseur). */
  deliver_target_email?: string | null
  created_at: string
}

export async function fetchMailAliases(token: string, accountId: number): Promise<MailAliasResponse[]> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/aliases`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail aliases: ${res.status}`)
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as MailAliasResponse[]) : []
}

export async function createMailAlias(
  token: string,
  accountId: number,
  payload: { alias_email: string; label?: string; deliver_target_email?: string }
): Promise<{ id: number; alias_email: string }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/aliases`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Create alias: ${res.status}`)
  }
  return res.json() as Promise<{ id: number; alias_email: string }>
}

/** Met à jour libellé et/ou la cible de livraison documentée d’un alias. */
export async function patchMailAlias(
  token: string,
  accountId: number,
  aliasId: number,
  patch: { label?: string; deliver_target_email?: string }
): Promise<{ ok: boolean }> {
  const body: Record<string, string> = {}
  if (patch.label !== undefined) body.label = patch.label
  if (patch.deliver_target_email !== undefined) body.deliver_target_email = patch.deliver_target_email
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/aliases/${aliasId}`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Patch alias: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean }>
}

export async function deleteMailAlias(token: string, accountId: number, aliasId: number): Promise<void> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/aliases/${aliasId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Delete alias: ${res.status}`)
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

/** Télécharge le fichier d’une pièce jointe (Bearer requis — ouvrir via blob côté UI). */
export async function downloadMailAttachment(
  token: string,
  accountId: number,
  messageId: number,
  attachmentId: number
): Promise<Blob> {
  const res = await fetch(
    apiUrl(`/mail/me/accounts/${accountId}/messages/${messageId}/attachments/${attachmentId}`),
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Pièce jointe: ${res.status}`)
  }
  return res.blob()
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

export type MailStandardFolderId = 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'
/** Dossier standard, vue agrégée `all`, vue multi-boîtes `unified`, ou chemin IMAP synchronisé (même valeur qu’en base). */
export type MailFolderId = MailStandardFolderId | 'all' | 'unified' | (string & {})

export async function moveMailMessageToFolder(
  token: string,
  accountId: number,
  messageId: number,
  folder: string
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
  options?: { imap_host?: string; imap_port?: number; extra_imap_folders?: string[] }
): Promise<{ synced: number; message: string }> {
  const body: Record<string, unknown> = {
    password: password ?? '',
    imap_host: options?.imap_host,
    imap_port: options?.imap_port,
  }
  if (options?.extra_imap_folders != null && options.extra_imap_folders.length > 0) {
    body.extra_imap_folders = options.extra_imap_folders
  }
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/sync`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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

export type MailFolderFolderStat = { total: number; unread: number }

export type MailFolderExtraStat = { folder: string; total: number; unread: number }

export type MailFolderSummaryResponse = {
  inbox: MailFolderFolderStat
  sent: MailFolderFolderStat
  drafts: MailFolderFolderStat
  archive: MailFolderFolderStat
  spam: MailFolderFolderStat
  trash: MailFolderFolderStat
  /** Dossiers IMAP hors lot standard (clé = chemin IMAP en base). */
  extra: MailFolderExtraStat[]
}

/** Totaux / non-lus par dossier ; `extra` = dossiers IMAP personnalisés ayant des messages. */
export async function fetchMailFolderSummary(
  token: string,
  accountId: number
): Promise<MailFolderSummaryResponse> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/folders/summary`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail folder summary: ${res.status}`)
  const raw = (await res.json()) as Record<string, unknown>
  const stat = (k: string): MailFolderFolderStat => {
    const v = raw[k]
    if (v && typeof v === 'object' && 'total' in v && 'unread' in v) {
      return v as MailFolderFolderStat
    }
    return { total: 0, unread: 0 }
  }
  let extra: MailFolderExtraStat[] = []
  if (Array.isArray(raw.extra)) {
    extra = raw.extra.filter(
      (x): x is MailFolderExtraStat =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as MailFolderExtraStat).folder === 'string' &&
        typeof (x as MailFolderExtraStat).total === 'number' &&
        typeof (x as MailFolderExtraStat).unread === 'number'
    )
  }
  return {
    inbox: stat('inbox'),
    sent: stat('sent'),
    drafts: stat('drafts'),
    archive: stat('archive'),
    spam: stat('spam'),
    trash: stat('trash'),
    extra,
  }
}

export type MailImapFolderRow = {
  imap_path: string
  parent_imap_path: string
  label: string
  delimiter: string
  /** Rôle logique (RFC6154 / heuristique) : trash, sent, … — masqué dans la liste « autres dossiers » si doublon des entrées standard. */
  imap_special_use?: string
  /** Dossier créé via Cloudity (renommage / suppression autorisés côté UI). */
  user_created?: boolean
  ui_color?: string
  ui_icon?: string
}

/** Arborescence dossiers telle que renvoyée par IMAP LIST (après sync). */
export async function fetchMailImapFolders(token: string, accountId: number): Promise<MailImapFolderRow[]> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/imap-folders`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail IMAP folders: ${res.status}`)
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as MailImapFolderRow[]) : []
}

/** Crée un dossier IMAP sous un parent (ex. INBOX) : CREATE serveur + persistance LIST (`mail_imap_folders`). */
export async function createMailImapFolder(
  token: string,
  accountId: number,
  payload: {
    parent_imap_path?: string
    /** Nom simple ou chemin avec `/` (ex. `Candidatures/RH`) sous le parent. */
    label?: string
    path?: string
    ui_color?: string
    ui_icon?: string
  }
): Promise<{ ok: boolean; imap_path: string; parent_imap_path?: string; label?: string }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/imap-folders`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent_imap_path: payload.parent_imap_path ?? 'INBOX',
      label: payload.label ?? '',
      path: payload.path ?? '',
      ui_color: payload.ui_color?.trim() ?? '',
      ui_icon: payload.ui_icon?.trim() ?? '',
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t
    try {
      const j = JSON.parse(t) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* corps non JSON */
    }
    throw new Error(msg || `Création dossier IMAP: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean; imap_path: string; parent_imap_path?: string; label?: string }>
}

export async function renameMailImapFolder(
  token: string,
  accountId: number,
  payload: { imap_path: string; new_label: string }
): Promise<{ ok: boolean; imap_path: string }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/imap-folders/rename`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imap_path: payload.imap_path, new_label: payload.new_label }),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t
    try {
      const j = JSON.parse(t) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Renommage dossier IMAP: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean; imap_path: string }>
}

export async function deleteMailImapFolder(
  token: string,
  accountId: number,
  payload: { imap_path: string }
): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/imap-folders/delete`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imap_path: payload.imap_path }),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t
    try {
      const j = JSON.parse(t) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Suppression dossier IMAP: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean }>
}

export type MailTagResponse = {
  id: number
  account_id: number
  name: string
  color: string
  created_at: string
}

export async function fetchMailTags(token: string, accountId: number): Promise<MailTagResponse[]> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/tags`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Mail tags: ${res.status}`)
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as MailTagResponse[]) : []
}

export async function createMailTag(
  token: string,
  accountId: number,
  payload: { name: string; color?: string }
): Promise<{ id: number; name: string; existed?: boolean }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/tags`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Create mail tag: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string; existed?: boolean }>
}

export async function putMailMessageTags(
  token: string,
  accountId: number,
  messageId: number,
  tagIds: number[]
): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl(`/mail/me/accounts/${accountId}/messages/${messageId}/tags`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_ids: tagIds }),
  })
  if (!res.ok) throw new Error(`Put message tags: ${res.status}`)
  return res.json() as Promise<{ ok: boolean }>
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
    /** Adresse « De » : boîte principale ou alias enregistré pour ce compte. */
    from_email?: string
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
  /** Nom du dossier parent (recherche GET /drive/nodes/search). */
  parent_folder_name?: string
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

/** Recherche par nom sur tout le Drive (ou sous-arbre si `parent_id` est défini). */
export async function fetchDriveSearch(
  token: string,
  q: string,
  opts?: { limit?: number; parent_id?: number | null }
): Promise<DriveNode[]> {
  const params = new URLSearchParams()
  params.set('q', q)
  if (opts?.limit != null && opts.limit > 0) {
    params.set('limit', String(Math.min(200, opts.limit)))
  }
  if (opts?.parent_id != null && opts.parent_id !== undefined) {
    params.set('parent_id', String(opts.parent_id))
  }
  const res = await fetch(apiUrl(`/drive/nodes/search?${params.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive search: ${res.status}`)
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

/** Réponse paginée : toutes les images du Drive (tous dossiers), tri récent d’abord. */
export type DrivePhotosTimelinePage = {
  items: DriveNode[]
  limit: number
  offset: number
  has_more: boolean
}

export async function fetchDrivePhotosTimeline(
  token: string,
  opts?: { limit?: number; offset?: number }
): Promise<DrivePhotosTimelinePage> {
  const limit = opts?.limit ?? 48
  const offset = opts?.offset ?? 0
  const res = await fetch(
    apiUrl(`/photos/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`),
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Photos timeline: ${res.status}`)
  return res.json() as Promise<DrivePhotosTimelinePage>
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
  nodeId: number,
  options?: { inline?: boolean }
): Promise<Blob> {
  const q = options?.inline ? '?inline=1' : ''
  const res = await fetch(apiUrl(`/drive/nodes/${nodeId}/content${q}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download: ${res.status}`)
  const blob = await res.blob()
  const hdr = res.headers.get('Content-Type')?.split(';')[0]?.trim()
  if (
    hdr &&
    hdr !== 'application/octet-stream' &&
    (!blob.type || blob.type === 'application/octet-stream')
  ) {
    return new Blob([await blob.arrayBuffer()], { type: hdr })
  }
  return blob
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

// Calendar — agendas + événements (style Google)
export type UserCalendar = {
  id: number
  tenant_id: number
  user_id: number
  name: string
  color_hex: string
  sort_order: number
  created_at: string
  updated_at: string
}

export async function fetchUserCalendars(token: string): Promise<UserCalendar[]> {
  const res = await fetch(apiUrl('/calendar/calendars'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Calendars: ${res.status}`)
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as UserCalendar[]) : []
}

export async function createUserCalendar(
  token: string,
  payload: { name: string; color_hex?: string }
): Promise<{ id: number; name: string; color_hex: string }> {
  const res = await fetch(apiUrl('/calendar/calendars'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Create calendar: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string; color_hex: string }>
}

export type CalendarEvent = {
  id: number
  tenant_id: number
  user_id: number
  calendar_id?: number | null
  title: string
  start_at: string
  end_at: string
  all_day: boolean
  location?: string | null
  description?: string | null
  created_at: string
  updated_at: string
}

export async function fetchCalendarEvents(token: string, calendarId?: number | null): Promise<CalendarEvent[]> {
  const q = calendarId != null && calendarId > 0 ? `?calendar_id=${calendarId}` : ''
  const res = await fetch(apiUrl(`/calendar/events${q}`), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Calendar: ${res.status}`)
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as CalendarEvent[]) : []
}

export async function createCalendarEvent(
  token: string,
  data: {
    title: string
    start_at: string
    end_at: string
    all_day?: boolean
    location?: string
    description?: string
    calendar_id?: number
  }
): Promise<{ id: number; title: string; calendar_id?: number }> {
  const res = await fetch(apiUrl('/calendar/events'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Create event: ${res.status}`)
  return res.json() as Promise<{ id: number; title: string; calendar_id?: number }>
}

export async function updateCalendarEvent(
  token: string,
  eventId: number,
  patch: Partial<{
    title: string
    start_at: string
    end_at: string
    all_day: boolean
    location: string | null
    description: string | null
    calendar_id: number
  }>
): Promise<{ id: number }> {
  const res = await fetch(apiUrl(`/calendar/events/${eventId}`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Update event: ${res.status}`)
  return res.json() as Promise<{ id: number }>
}

export async function deleteCalendarEvent(token: string, eventId: number): Promise<void> {
  const res = await fetch(apiUrl(`/calendar/events/${eventId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) throw new Error(`Delete event: ${res.status}`)
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
export type TaskRepeatRule = 'daily' | 'weekly' | 'weekdays' | 'monthly'

export type Task = {
  id: number
  tenant_id: number
  user_id: number
  list_id?: number | null
  title: string
  completed: boolean
  due_at?: string | null
  repeat_rule?: TaskRepeatRule | string | null
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
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as Task[]) : []
}

export async function createTaskList(token: string, name: string): Promise<{ id: number; name: string }> {
  const res = await fetch(apiUrl('/tasks/lists'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Create task list: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string }>
}

export async function createTask(
  token: string,
  payload: { title: string; list_id?: number | null; due_at?: string | null; repeat_rule?: string | null }
): Promise<{ id: number; title: string }> {
  const res = await fetch(apiUrl('/tasks'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      list_id: payload.list_id ?? undefined,
      due_at: payload.due_at ?? undefined,
      repeat_rule: payload.repeat_rule ?? undefined,
    }),
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

export type ContactImportResult = {
  imported: number
  updated: number
  skipped: number
  invalid: number
}

/** Import en masse (fichier CSV / JSON / HTML parsé côté client). */
export async function importContacts(
  token: string,
  contacts: { name: string; email: string; phone?: string }[],
  onDuplicate: 'skip' | 'update'
): Promise<ContactImportResult> {
  const res = await fetch(apiUrl('/contacts/import'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts, on_duplicate: onDuplicate }),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t || `Import contacts: ${res.status}`
    try {
      const j = JSON.parse(t) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* texte brut */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<ContactImportResult>
}

export async function updateTask(
  token: string,
  id: number,
  patch: Partial<{ title: string; completed: boolean; due_at: string | null; repeat_rule: string | null }>
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.completed !== undefined) body.completed = patch.completed
  if (patch.due_at !== undefined) body.due_at = patch.due_at === null ? '' : patch.due_at
  if (patch.repeat_rule !== undefined) body.repeat_rule = patch.repeat_rule === null ? '' : patch.repeat_rule
  const res = await fetch(apiUrl(`/tasks/${id}`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Update task: ${res.status}`)
}

export async function updateTaskCompleted(token: string, id: number, completed: boolean): Promise<void> {
  await updateTask(token, id, { completed })
}

export async function deleteTask(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/tasks/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) throw new Error(`Delete task: ${res.status}`)
}
