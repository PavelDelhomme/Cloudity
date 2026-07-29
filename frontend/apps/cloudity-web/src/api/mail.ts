/** Client API Mail utilisateur (`/mail/me/*`) — extrait du monolithe api.ts (FE-HUB / FE-SPLIT-01). */
import { apiFetch, apiJson, apiJsonOk } from '@cloudity/shared'

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
  /** false = pas de secret IMAP/OAuth en base — ne pas lancer de sync auto sans mot de passe saisi. */
  imap_auth_ready?: boolean
  /** Horodatage ISO de la dernière tentative de sync IMAP. */
  last_sync_at?: string | null
  /** Dernier message d'erreur sync (mot de passe refusé, OAuth révoqué, etc.). */
  last_sync_error?: string | null
  created_at: string
  updated_at: string
}

export async function fetchMailAccounts(token: string): Promise<MailAccountResponse[]> {
  return apiJson<MailAccountResponse[]>(token, '/mail/me/accounts', { json: false }, 'Mail accounts')
}

export async function createMailAccount(
  token: string,
  email: string,
  options?: { label?: string; password?: string }
): Promise<{
  id: number
  email: string
  label?: string
  user_login_email_aligned?: boolean
  user_login_email?: string
}> {
  const body: { email: string; label?: string; password?: string } = {
    email: email.trim().toLowerCase(),
    label: options?.label?.trim() || '',
  }
  if (options?.password != null && options.password.trim() !== '') {
    body.password = options.password.trim()
  }
  const res = await apiFetch(token, '/mail/me/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.status === 409) throw new Error('Cette adresse est déjà reliée')
  if (!res.ok) throw new Error(`Create mail account: ${res.status}`)
  return res.json() as Promise<{
    id: number
    email: string
    label?: string
    user_login_email_aligned?: boolean
    user_login_email?: string
  }>
}

export async function deleteMailAccount(token: string, accountId: number): Promise<void> {
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}`, { method: 'DELETE', json: false })
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
  scheduled_send_at?: string
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

export type MailFilterRuleResponse = {
  id: number
  account_id: number
  name: string
  from_pattern: string
  /** Domaine expéditeur (ex. `newsletter.com`), distinct du motif « from contient ». */
  from_domain_pattern?: string
  /** Destinataire (champ To/Cc/Bcc agrégé côté serveur). */
  recipient_pattern?: string
  has_tag_id?: number
  add_tag_id?: number
  subject_pattern: string
  has_attachments?: boolean
  action_folder: string
  mark_read?: boolean
  enabled: boolean
  rule_order?: number
  criteria_json?: string
  actions_json?: string
  created_at: string
  updated_at: string
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
    /** Recherche texte (objet, expéditeur, destinataires, corps texte brut) — serveur. */
    q?: string
    /** Avec `q` : `rank` (défaut) = ts_rank_cd puis date ; `date` = ordre chronologique uniquement. */
    sort?: 'rank' | 'date'
    /** Ordre chronologique : `desc` (défaut) ou `asc`. */
    order?: 'desc' | 'asc'
  }
): Promise<MailMessagesPageResponse> {
  const params = new URLSearchParams({ folder })
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.delivered_to?.trim()) params.set('delivered_to', options.delivered_to.trim())
  else if (options?.recipient?.trim()) params.set('recipient', options.recipient.trim())
  if (options?.tag_id != null && options.tag_id > 0) params.set('tag_id', String(options.tag_id))
  if (options?.thread_key?.trim()) params.set('thread_key', options.thread_key.trim())
  if (options?.q?.trim()) params.set('q', options.q.trim())
  if (options?.q?.trim() && options?.sort === 'date') params.set('sort', 'date')
  if (options?.order === 'asc') params.set('order', 'asc')
  const data = await apiJson<MailMessageResponse[] | MailMessagesPageResponse>(
    token,
    `/mail/me/accounts/${accountId}/messages?${params}`,
    { json: false },
    'Mail messages'
  )
  if (Array.isArray(data)) {
    return { messages: data, total: data.length }
  }
  const messages = Array.isArray(data.messages) ? data.messages : []
  const total = typeof data.total === 'number' ? data.total : messages.length
  return { messages, total }
}

/** Liste agrégée : toutes les boîtes du compte Cloudity (exclut corbeille, spam, brouillons, envoyés — comme `folder=all` par boîte). */
export async function fetchUnifiedMailMessages(
  token: string,
  options?: {
    limit?: number
    offset?: number
    recipient?: string
    delivered_to?: string
    thread_key?: string
    q?: string
    sort?: 'rank' | 'date'
    order?: 'desc' | 'asc'
  }
): Promise<MailMessagesPageResponse> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.delivered_to?.trim()) params.set('delivered_to', options.delivered_to.trim())
  else if (options?.recipient?.trim()) params.set('recipient', options.recipient.trim())
  if (options?.thread_key?.trim()) params.set('thread_key', options.thread_key.trim())
  if (options?.q?.trim()) params.set('q', options.q.trim())
  if (options?.q?.trim() && options?.sort === 'date') params.set('sort', 'date')
  if (options?.order === 'asc') params.set('order', 'asc')
  const q = params.toString()
  const data = await apiJson<MailMessagesPageResponse>(
    token,
    `/mail/me/messages/unified${q ? `?${q}` : ''}`,
    { json: false },
    'Mail messages unifiés'
  )
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
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Update mail account: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean }>
}

export type MailAccountAliasResponse = {
  id: number
  account_id: number
  alias_email: string
  label?: string | null
  /** Cible de livraison / routage documenté (Pass, transfert — non appliqué seul sans config DNS / fournisseur). */
  deliver_target_email?: string | null
  /** false = ignoré pour filtre `delivered_to`, envoi From et barre latérale. */
  enabled?: boolean
  created_at: string
}

export type MailAliasConfigResponse = {
  primary_domain?: string
  alias_host_suffix?: string
  validation_strict: boolean
  env_configured: boolean
}

export async function fetchMailAliasConfig(token: string): Promise<MailAliasConfigResponse> {
  return apiJson<MailAliasConfigResponse>(
    token,
    '/mail/me/alias-config',
    { json: false },
    'Mail alias config'
  )
}

export async function fetchMailAliases(token: string, accountId: number): Promise<MailAccountAliasResponse[]> {
  const data = await apiJson<unknown>(
    token,
    `/mail/me/accounts/${accountId}/aliases`,
    { json: false },
    'Mail aliases'
  )
  return Array.isArray(data) ? (data as MailAccountAliasResponse[]) : []
}

export async function fetchMailFilterRules(token: string, accountId: number): Promise<MailFilterRuleResponse[]> {
  return apiJson<MailFilterRuleResponse[]>(
    token,
    `/mail/me/accounts/${accountId}/rules`,
    { json: false },
    'Mail rules'
  )
}

export async function createMailFilterRule(
  token: string,
  accountId: number,
  payload: {
    name: string
    from_pattern?: string
    from_domain_pattern?: string
    recipient_pattern?: string
    has_tag_id?: number
    add_tag_id?: number
    subject_pattern?: string
    has_attachments?: boolean
    action_folder: string
    mark_read?: boolean
    enabled?: boolean
    rule_order?: number
  }
): Promise<{ ok: boolean; id: number }> {
  return apiJsonOk<{ ok: boolean; id: number }>(
    token,
    `/mail/me/accounts/${accountId}/rules`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Create mail rule'
  )
}


export async function patchMailFilterRule(
  token: string,
  accountId: number,
  ruleId: number,
  patch: {
    name?: string
    from_pattern?: string
    from_domain_pattern?: string
    recipient_pattern?: string
    has_tag_id?: number | null
    add_tag_id?: number | null
    subject_pattern?: string
    has_attachments?: boolean
    action_folder?: string
    mark_read?: boolean
    enabled?: boolean
    rule_order?: number
  }
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/me/accounts/${accountId}/rules/${ruleId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    'Patch mail rule'
  )
}

export async function deleteMailFilterRule(token: string, accountId: number, ruleId: number): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/me/accounts/${accountId}/rules/${ruleId}`,
    { method: 'DELETE', json: false },
    'Delete mail rule'
  )
}

export async function applyMailFilterRules(token: string, accountId: number): Promise<{ ok: boolean; affected: number }> {
  return apiJsonOk<{ ok: boolean; affected: number }>(
    token,
    `/mail/me/accounts/${accountId}/rules/apply`,
    { method: 'POST', json: false },
    'Apply mail rules'
  )
}

export async function createMailAlias(
  token: string,
  accountId: number,
  payload: { alias_email: string; label?: string; deliver_target_email?: string }
): Promise<{ id: number; alias_email: string }> {
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/aliases`, {
    method: 'POST',
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
  patch: { label?: string; deliver_target_email?: string; enabled?: boolean }
): Promise<{ ok: boolean }> {
  const body: Record<string, string | boolean> = {}
  if (patch.label !== undefined) body.label = patch.label
  if (patch.deliver_target_email !== undefined) body.deliver_target_email = patch.deliver_target_email
  if (patch.enabled !== undefined) body.enabled = patch.enabled
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/aliases/${aliasId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Patch alias: ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean }>
}

export async function deleteMailAlias(token: string, accountId: number, aliasId: number): Promise<void> {
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/aliases/${aliasId}`, {
    method: 'DELETE',
    json: false,
  })
  if (!res.ok) throw new Error(`Delete alias: ${res.status}`)
}

export async function fetchMailMessage(
  token: string,
  accountId: number,
  messageId: number
): Promise<MailMessageDetailResponse> {
  return apiJson<MailMessageDetailResponse>(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}`,
    { json: false },
    'Mail message'
  )
}

/** Télécharge le fichier d’une pièce jointe (Bearer requis — ouvrir via blob côté UI). */
export async function downloadMailAttachment(
  token: string,
  accountId: number,
  messageId: number,
  attachmentId: number
): Promise<Blob> {
  const res = await apiFetch(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}/attachments/${attachmentId}`,
    { json: false }
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
  return apiJsonOk<{ ok: boolean; read: boolean }>(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}/read`,
    { method: 'PATCH', body: JSON.stringify({ read }) },
    'Mark read'
  )
}

export type MailStandardFolderId = 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'
/** Dossier standard, vue agrégée `all`, vue multi-boîtes `unified`, ou chemin IMAP synchronisé (même valeur qu’en base). `string & {}` : pattern TS pour ne pas absorber les littéraux dans le union. */
// eslint-disable-next-line @typescript-eslint/ban-types -- voir jsdoc ci-dessus
export type MailFolderId = MailStandardFolderId | 'all' | 'unified' | (string & {})

export async function moveMailMessageToFolder(
  token: string,
  accountId: number,
  messageId: number,
  folder: string
): Promise<{ ok: boolean; folder: string }> {
  return apiJsonOk<{ ok: boolean; folder: string }>(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}/folder`,
    { method: 'PATCH', body: JSON.stringify({ folder }) },
    'Move message'
  )
}

export async function markMailMessagesReadBulk(
  token: string,
  accountId: number,
  messageIds: number[],
  read: boolean
): Promise<{ ok: boolean; updated: number; requested: number; read: boolean }> {
  const ids = [...new Set(messageIds.filter((x) => Number.isFinite(x) && x > 0))]
  return apiJsonOk<{ ok: boolean; updated: number; requested: number; read: boolean }>(
    token,
    `/mail/me/accounts/${accountId}/messages/read`,
    { method: 'PATCH', body: JSON.stringify({ message_ids: ids, read }) },
    'Bulk mark read'
  )
}

export async function moveMailMessagesToFolderBulk(
  token: string,
  accountId: number,
  messageIds: number[],
  folder: string
): Promise<{ ok: boolean; updated: number; requested: number; folder: string }> {
  const ids = [...new Set(messageIds.filter((x) => Number.isFinite(x) && x > 0))]
  return apiJsonOk<{ ok: boolean; updated: number; requested: number; folder: string }>(
    token,
    `/mail/me/accounts/${accountId}/messages/folder`,
    { method: 'PATCH', body: JSON.stringify({ message_ids: ids, folder }) },
    'Bulk move messages'
  )
}

export async function deleteMailMessagePermanently(
  token: string,
  accountId: number,
  messageId: number
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}/permanent`,
    { method: 'DELETE', json: false },
    'Permanent delete message'
  )
}

/** Indique si la connexion Gmail OAuth est configurée sur le serveur. */
export async function getMailGoogleOAuthStatus(token: string): Promise<{ enabled: boolean }> {
  return apiJson(token, '/mail/me/oauth/google/status', { json: false }, 'Mail Google OAuth status')
}

/** Retourne l’URL de redirection OAuth Google pour connecter une boîte Gmail sans mot de passe d’application. */
export async function getMailGoogleOAuthRedirectUrl(token: string): Promise<{ redirect_url: string }> {
  const res = await apiFetch(token, '/mail/me/oauth/google/authorize', { json: false })
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
): Promise<{ synced: number; message: string; password_stored?: boolean; imap_host_used?: string; imap_host_saved?: boolean }> {
  const body: Record<string, unknown> = {
    password: password ?? '',
    imap_host: options?.imap_host,
    imap_port: options?.imap_port,
  }
  if (options?.extra_imap_folders != null && options.extra_imap_folders.length > 0) {
    body.extra_imap_folders = options.extra_imap_folders
  }
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/sync`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    return {
      synced: 0,
      message: 'Synchronisation déjà en cours pour cette boîte',
    }
  }
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `Sync: ${res.status}`)
    }
  }
  return res.json() as Promise<{
    synced: number
    message: string
    password_stored?: boolean
    imap_host_used?: string
    imap_host_saved?: boolean
  }>
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
  const raw = await apiJson<Record<string, unknown>>(
    token,
    `/mail/me/accounts/${accountId}/folders/summary`,
    { json: false },
    'Mail folder summary'
  )
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
  const data = await apiJson<unknown>(
    token,
    `/mail/me/accounts/${accountId}/imap-folders`,
    { json: false },
    'Mail IMAP folders'
  )
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
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/imap-folders`, {
    method: 'POST',
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
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/imap-folders/rename`, {
    method: 'POST',
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
  const res = await apiFetch(token, `/mail/me/accounts/${accountId}/imap-folders/delete`, {
    method: 'POST',
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
  const data = await apiJson<unknown>(
    token,
    `/mail/me/accounts/${accountId}/tags`,
    { json: false },
    'Mail tags'
  )
  return Array.isArray(data) ? (data as MailTagResponse[]) : []
}

export async function createMailTag(
  token: string,
  accountId: number,
  payload: { name: string; color?: string }
): Promise<{ id: number; name: string; existed?: boolean }> {
  return apiJson<{ id: number; name: string; existed?: boolean }>(
    token,
    `/mail/me/accounts/${accountId}/tags`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Create mail tag'
  )
}

export async function putMailMessageTags(
  token: string,
  accountId: number,
  messageId: number,
  tagIds: number[]
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/me/accounts/${accountId}/messages/${messageId}/tags`,
    { method: 'PUT', body: JSON.stringify({ tag_ids: tagIds }) },
    'Put message tags'
  )
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
  const res = await apiFetch(token, '/mail/me/send', { method: 'POST', body: JSON.stringify(payload) })
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

export async function scheduleMailMessage(
  token: string,
  payload: {
    account_id: number
    to: string
    subject: string
    body: string
    from_email?: string
    scheduled_send_at: string
  }
): Promise<{ ok: boolean; id: number; scheduled_send_at: string }> {
  const res = await apiFetch(token, '/mail/me/send/schedule', { method: 'POST', body: JSON.stringify(payload) })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch {
      throw new Error(t || `Schedule send: ${res.status}`)
    }
  }
  return res.json() as Promise<{ ok: boolean; id: number; scheduled_send_at: string }>
}
