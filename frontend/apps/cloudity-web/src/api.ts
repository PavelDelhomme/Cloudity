import { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY, getAuthHeaders, apiFetch, apiJson, apiJsonOk } from '@cloudity/shared'

export { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY, getAuthHeaders, apiFetch, apiJson, apiJsonOk }

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

export async function fetchTenants(
  token: string,
  options?: { skip?: number; limit?: number; domainContains?: string }
): Promise<TenantResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  if (options?.domainContains?.trim()) params.set('domain_contains', options.domainContains.trim())
  const path = `/admin/tenants${params.toString() ? `?${params.toString()}` : ''}`
  return apiJson<TenantResponse[]>(token, path, undefined, 'Tenants')
}

/** Liste paginée : une ligne de plus est demandée pour savoir s'il existe une page suivante. */
export async function fetchTenantsPage(
  token: string,
  options: { skip: number; pageSize: number; domainContains?: string }
): Promise<{ items: TenantResponse[]; hasMore: boolean }> {
  const pageSize = options.pageSize
  const raw = await fetchTenants(token, {
    skip: options.skip,
    limit: pageSize + 1,
    domainContains: options.domainContains,
  })
  const hasMore = raw.length > pageSize
  return { items: hasMore ? raw.slice(0, pageSize) : raw, hasMore }
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
  email?: string
  is_active?: boolean
  role?: string
}

export async function fetchUsers(
  tenantId: number,
  token: string,
  options?: { skip?: number; limit?: number }
): Promise<UserResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  const path = `/admin/tenants/${tenantId}/users${params.toString() ? `?${params.toString()}` : ''}`
  return apiJson<UserResponse[]>(token, path, undefined, 'Users')
}

export async function fetchUsersPage(
  tenantId: number,
  token: string,
  options: { skip: number; pageSize: number }
): Promise<{ items: UserResponse[]; hasMore: boolean }> {
  const pageSize = options.pageSize
  const raw = await fetchUsers(tenantId, token, { skip: options.skip, limit: pageSize + 1 })
  const hasMore = raw.length > pageSize
  return { items: hasMore ? raw.slice(0, pageSize) : raw, hasMore }
}

export async function deleteTenant(tenantId: number, token: string): Promise<void> {
  const res = await apiFetch(token, `/admin/tenants/${tenantId}`, { method: 'DELETE', json: false })
  if (!res.ok) {
    let detail = `Suppression tenant: ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
}

export async function updateUser(
  userId: number,
  payload: UserUpdatePayload,
  token: string
): Promise<UserResponse> {
  return apiJson<UserResponse>(
    token,
    `/admin/users/${userId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    'Update user'
  )
}

export type DashboardStatsResponse = {
  active_tenants: number
  total_users: number
  api_calls_today: number
}

export type PerformanceContainerResponse = {
  name: string
  cpu_percent?: number | null
  memory_usage_bytes?: number | null
  memory_limit_bytes?: number | null
  memory_percent?: number | null
  net_io?: string | null
  block_io?: string | null
  pids?: number | null
}

export type PerformanceHostResponse = {
  loadavg_1m?: number | null
  loadavg_5m?: number | null
  loadavg_15m?: number | null
  cgroup_cpu_usage_usec?: number | null
  cgroup_cpu_user_usec?: number | null
  cgroup_cpu_system_usec?: number | null
  cgroup_memory_current_bytes?: number | null
  cgroup_memory_peak_bytes?: number | null
  cgroup_io_read_bytes?: number | null
  cgroup_io_write_bytes?: number | null
}

export type PerformanceOverviewResponse = {
  timestamp_utc: string
  source: string
  host: PerformanceHostResponse
  containers: PerformanceContainerResponse[]
  notes: string[]
}

export async function fetchDashboardStats(token: string): Promise<DashboardStatsResponse> {
  return apiJson<DashboardStatsResponse>(token, '/admin/stats', undefined, 'Stats')
}

export async function fetchPerformanceOverview(token: string): Promise<PerformanceOverviewResponse> {
  return apiJson<PerformanceOverviewResponse>(token, '/admin/performance/overview', undefined, 'Performance overview')
}

export type PerformanceHistoryItemResponse = {
  id: number
  recorded_at: string
  source: string
  overview_timestamp_utc?: string | null
  containers_count: number
}

export type PerformanceHistoryResponse = {
  items: PerformanceHistoryItemResponse[]
  storage_ready: boolean
}

export type PipelineRunItemResponse = {
  id: number
  recorded_at: string
  pipeline_kind: string
  run_id?: string | null
  success?: boolean | null
  duration_ms?: number | null
  cpu_pct_max?: number | null
  mem_peak_mb?: number | null
  meta: Record<string, unknown>
}

export type PipelineRunsResponse = {
  items: PipelineRunItemResponse[]
  storage_ready: boolean
}

export type BudgetViolationResponse = {
  key: string
  threshold: number | string
  observed: number | string
  message: string
}

export type BudgetStatusResponse = {
  evaluated_at: string
  source_snapshot: string
  violations: BudgetViolationResponse[]
  budgets: Record<string, number | string>
}

export async function fetchPerformanceHistory(token: string, limit = 24): Promise<PerformanceHistoryResponse> {
  return apiJson<PerformanceHistoryResponse>(
    token,
    `/admin/performance/history?limit=${encodeURIComponent(String(limit))}`,
    undefined,
    'Performance history'
  )
}

export async function fetchPipelineRuns(token: string, limit = 40): Promise<PipelineRunsResponse> {
  return apiJson<PipelineRunsResponse>(
    token,
    `/admin/performance/pipeline-runs?limit=${encodeURIComponent(String(limit))}`,
    undefined,
    'Pipeline runs'
  )
}

export async function fetchBudgetStatus(token: string): Promise<BudgetStatusResponse> {
  return apiJson<BudgetStatusResponse>(token, '/admin/performance/budget-status', undefined, 'Budget status')
}

export async function recordPerformanceSnapshot(token: string): Promise<{ id: number; recorded_at: string }> {
  return apiJson<{ id: number; recorded_at: string }>(
    token,
    '/admin/performance/record',
    { method: 'POST' },
    'Performance record'
  )
}

/** Rapport CVE/OSV (admin) — source api.osv.dev, cache optionnel côté admin-service. */
export type CveVulnEntryResponse = {
  osv_id: string
  summary?: string | null
  modified?: string | null
  cve_aliases: string[]
}

export type CveFindingResponse = {
  ecosystem: string
  package: string
  version: string
  vulns: CveVulnEntryResponse[]
}

export type CveReportResponse = {
  scanned_at: string
  source: string
  packages_scanned: number
  packages_with_vulns: number
  vuln_entries_total: number
  findings: CveFindingResponse[]
  notes: string[]
  summary: Record<string, unknown>
  error?: string | null
  from_cache: boolean
  snapshot_id?: number | null
}

export async function fetchCveReport(token: string, refresh = false): Promise<CveReportResponse> {
  const q = refresh ? 'refresh=true' : 'refresh=false'
  return apiJson<CveReportResponse>(token, `/admin/security/cve-report?${q}`, undefined, 'CVE report')
}

export async function refreshCveReport(token: string): Promise<CveReportResponse> {
  return apiJson<CveReportResponse>(token, '/admin/security/cve-report/refresh', { method: 'POST' }, 'CVE refresh')
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
  return apiJson<VaultResponse[]>(token, '/pass/vaults', undefined, 'Vaults')
}

export async function createVault(token: string, name: string): Promise<{ id: number; name: string }> {
  return apiJson<{ id: number; name: string }>(
    token,
    '/pass/vaults',
    { method: 'POST', body: JSON.stringify({ name: name || 'Default' }) },
    'Create vault'
  )
}

export async function fetchVaultItems(token: string, vaultId: number): Promise<PassItemResponse[]> {
  return apiJson<PassItemResponse[]>(token, `/pass/vaults/${vaultId}/items`, undefined, 'Vault items')
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

export async function fetchDomains(
  token: string,
  options?: { skip?: number; limit?: number }
): Promise<MailDomainResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  const path = `/mail/domains${params.toString() ? `?${params.toString()}` : ''}`
  return apiJson<MailDomainResponse[]>(token, path, undefined, 'Domains')
}

export async function fetchDomainsPage(
  token: string,
  options: { skip: number; pageSize: number }
): Promise<{ items: MailDomainResponse[]; hasMore: boolean }> {
  const pageSize = options.pageSize
  const raw = await fetchDomains(token, { skip: options.skip, limit: pageSize + 1 })
  const hasMore = raw.length > pageSize
  return { items: hasMore ? raw.slice(0, pageSize) : raw, hasMore }
}

export async function createDomain(token: string, domain: string): Promise<{ id: number; domain: string }> {
  return apiJson<{ id: number; domain: string }>(
    token,
    '/mail/domains',
    { method: 'POST', body: JSON.stringify({ domain }) },
    'Create domain'
  )
}

export async function patchDomain(
  token: string,
  domainId: number,
  patch: { is_active?: boolean }
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/domains/${domainId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    'Patch domain'
  )
}

export async function deleteDomain(token: string, domainId: number): Promise<void> {
  const res = await apiFetch(token, `/mail/domains/${domainId}`, { method: 'DELETE', json: false })
  if (!res.ok) throw new Error(`Delete domain: ${res.status}`)
}

export type MailboxResponse = {
  id: number
  domain_id: number
  local_part: string
  quota_mb: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function fetchDomainMailboxes(
  token: string,
  domainId: number,
  options?: { skip?: number; limit?: number }
): Promise<MailboxResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  const path = `/mail/domains/${domainId}/mailboxes${params.toString() ? `?${params.toString()}` : ''}`
  return apiJson<MailboxResponse[]>(token, path, undefined, 'Mailboxes')
}

export async function fetchDomainMailboxesPage(
  token: string,
  domainId: number,
  options: { skip: number; pageSize: number }
): Promise<{ items: MailboxResponse[]; hasMore: boolean }> {
  const pageSize = options.pageSize
  const raw = await fetchDomainMailboxes(token, domainId, { skip: options.skip, limit: pageSize + 1 })
  const hasMore = raw.length > pageSize
  return { items: hasMore ? raw.slice(0, pageSize) : raw, hasMore }
}

export async function createDomainMailbox(
  token: string,
  domainId: number,
  payload: { local_part: string; password?: string; quota_mb?: number }
): Promise<{ id: number; local_part: string }> {
  return apiJson<{ id: number; local_part: string }>(
    token,
    `/mail/domains/${domainId}/mailboxes`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Create mailbox'
  )
}

export async function deleteDomainMailbox(token: string, domainId: number, mailboxId: number): Promise<void> {
  const res = await apiFetch(token, `/mail/domains/${domainId}/mailboxes/${mailboxId}`, {
    method: 'DELETE',
    json: false,
  })
  if (!res.ok) throw new Error(`Delete mailbox: ${res.status}`)
}

export async function patchDomainMailbox(
  token: string,
  domainId: number,
  mailboxId: number,
  patch: { quota_mb?: number; is_active?: boolean }
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/domains/${domainId}/mailboxes/${mailboxId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    'Patch mailbox'
  )
}

export type DomainAliasResponse = {
  id: number
  domain_id: number
  source_local: string
  destination: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export async function fetchDomainAliases(
  token: string,
  domainId: number,
  options?: { skip?: number; limit?: number }
): Promise<DomainAliasResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  const path = `/mail/domains/${domainId}/aliases${params.toString() ? `?${params.toString()}` : ''}`
  return apiJson<DomainAliasResponse[]>(token, path, undefined, 'Aliases')
}

export async function fetchDomainAliasesPage(
  token: string,
  domainId: number,
  options: { skip: number; pageSize: number }
): Promise<{ items: DomainAliasResponse[]; hasMore: boolean }> {
  const pageSize = options.pageSize
  const raw = await fetchDomainAliases(token, domainId, { skip: options.skip, limit: pageSize + 1 })
  const hasMore = raw.length > pageSize
  return { items: hasMore ? raw.slice(0, pageSize) : raw, hasMore }
}

export async function createDomainAlias(
  token: string,
  domainId: number,
  payload: { source_local: string; destination: string }
): Promise<{ id: number; source_local: string; destination: string }> {
  return apiJson<{ id: number; source_local: string; destination: string }>(
    token,
    `/mail/domains/${domainId}/aliases`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Create domain alias'
  )
}

export async function deleteDomainAlias(token: string, domainId: number, aliasId: number): Promise<void> {
  const res = await apiFetch(token, `/mail/domains/${domainId}/aliases/${aliasId}`, {
    method: 'DELETE',
    json: false,
  })
  if (!res.ok) throw new Error(`Delete domain alias: ${res.status}`)
}

export async function patchDomainAlias(
  token: string,
  domainId: number,
  aliasId: number,
  patch: { destination: string }
): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/mail/domains/${domainId}/aliases/${aliasId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    'Patch domain alias'
  )
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
  return apiJson<MailAccountResponse[]>(token, '/mail/me/accounts', { json: false }, 'Mail accounts')
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
  const res = await apiFetch(token, '/mail/me/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.status === 409) throw new Error('Cette adresse est déjà reliée')
  if (!res.ok) throw new Error(`Create mail account: ${res.status}`)
  return res.json() as Promise<{ id: number; email: string; label?: string }>
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

/** Liste agrégée : toutes les boîtes du compte Cloudity (exclut corbeille, spam, brouillons — comme `folder=all` par boîte). */
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
  created_at: string
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
  patch: { label?: string; deliver_target_email?: string }
): Promise<{ ok: boolean }> {
  const body: Record<string, string> = {}
  if (patch.label !== undefined) body.label = patch.label
  if (patch.deliver_target_email !== undefined) body.deliver_target_email = patch.deliver_target_email
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
): Promise<{ synced: number; message: string }> {
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

export type LoginBody = { email: string; password: string; tenant_id?: number }
export type LoginResponse = {
  access_token: string
  refresh_token?: string
  requires_2fa?: boolean
}

function parseApiErrorMessage(raw: string, fallback: string): string {
  const t = raw.trim()
  if (!t) return fallback
  try {
    const parsed = JSON.parse(t) as { error?: string; message?: string }
    const msg = (parsed.error || parsed.message || '').trim().toLowerCase()
    if (msg === 'invalid credentials') return 'Identifiants invalides. Vérifiez votre email et votre mot de passe.'
    if (msg === 'invalid or expired token') return 'Session expirée. Reconnectez-vous.'
    return parsed.error || parsed.message || fallback
  } catch {
    return t
  }
}

export async function login(body: LoginBody): Promise<LoginResponse> {
  const res = await apiFetch(null, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ ...body, tenant_id: String(body.tenant_id ?? 1) }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(parseApiErrorMessage(t, `Connexion impossible (${res.status})`))
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
  const res = await apiFetch(null, '/auth/refresh', {
    method: 'POST',
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
  const res = await apiFetch(null, '/auth/register', {
    method: 'POST',
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
  const path = parentId == null ? '/drive/nodes' : `/drive/nodes?parent_id=${parentId}`
  return apiJson<DriveNode[]>(token, path, { json: false }, 'Drive')
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
  return apiJson<DriveNode[]>(
    token,
    `/drive/nodes/search?${params.toString()}`,
    { json: false },
    'Drive search'
  )
}

/** Liste les fichiers récemment modifiés (tous dossiers confondus). */
export async function fetchDriveRecentFiles(
  token: string,
  limit = 20
): Promise<DriveNode[]> {
  return apiJson<DriveNode[]>(token, `/drive/nodes/recent?limit=${limit}`, { json: false }, 'Drive recent')
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
  return apiJson<DrivePhotosTimelinePage>(
    token,
    `/photos/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
    { json: false },
    'Photos timeline'
  )
}

export async function createDriveFolder(
  token: string,
  parentId: number | null,
  name: string
): Promise<{ id: number; name: string; is_folder: boolean }> {
  const res = await apiFetch(token, '/drive/nodes', {
    method: 'POST',
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
  const res = await apiFetch(token, '/drive/nodes', {
    method: 'POST',
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
  return apiJson<{ id: number; name: string }>(
    token,
    `/drive/nodes/${id}`,
    { method: 'PUT', body: JSON.stringify({ name }) },
    'Rename'
  )
}

/** Déplace un nœud (dossier ou fichier) vers un autre dossier. parentId = 0 ou null pour la racine. */
export async function moveDriveNode(
  token: string,
  nodeId: number,
  parentId: number | null
): Promise<{ id: number; name: string; parent_id: number | null }> {
  return apiJson<{ id: number; name: string; parent_id: number | null }>(
    token,
    `/drive/nodes/${nodeId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ parent_id: parentId === null || parentId === 0 ? 0 : parentId }),
    },
    'Move'
  )
}

/** Suppression (soft delete) : déplace en corbeille. */
export async function deleteDriveNode(token: string, id: number): Promise<void> {
  const res = await apiFetch(token, `/drive/nodes/${id}`, { method: 'DELETE', json: false })
  if (!res.ok) throw new Error(`Delete: ${res.status}`)
}

/** Liste les nœuds en corbeille. */
export async function fetchDriveTrash(token: string): Promise<DriveNode[]> {
  return apiJson<DriveNode[]>(token, '/drive/nodes/trash', { json: false }, 'Trash')
}

/** Restaure un nœud depuis la corbeille. */
export async function restoreDriveNode(token: string, id: number): Promise<void> {
  const res = await apiFetch(token, `/drive/nodes/${id}/restore`, { method: 'POST', json: false })
  if (!res.ok) throw new Error(`Restore: ${res.status}`)
}

/** Supprime définitivement un nœud (corbeille uniquement). */
export async function purgeDriveNode(token: string, id: number): Promise<void> {
  const res = await apiFetch(token, `/drive/nodes/trash/${id}`, { method: 'DELETE', json: false })
  if (!res.ok) throw new Error(`Purge: ${res.status}`)
}

export async function downloadDriveFile(
  token: string,
  nodeId: number,
  options?: { inline?: boolean }
): Promise<Blob> {
  const q = options?.inline ? '?inline=1' : ''
  const res = await apiFetch(token, `/drive/nodes/${nodeId}/content${q}`, { json: false })
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
  const res = await apiFetch(token, `/drive/nodes/${folderId}/zip`, { json: false })
  if (!res.ok) throw new Error(`Download folder: ${res.status}`)
  return res.blob()
}

export type DriveZipEntry = { path: string; name: string; size: number; is_dir: boolean }

/** Liste les entrées d'un fichier ZIP (sans extraire). */
export async function fetchDriveZipEntries(
  token: string,
  nodeId: number
): Promise<DriveZipEntry[]> {
  const data = await apiJson<{ entries?: unknown }>(
    token,
    `/drive/nodes/${nodeId}/archive/entries`,
    { json: false },
    'Zip entries'
  )
  return Array.isArray(data.entries) ? (data.entries as DriveZipEntry[]) : []
}

/** Crée une archive ZIP à partir des nœuds sélectionnés (fichiers + dossiers). */
export async function downloadDriveArchive(
  token: string,
  nodeIds: number[]
): Promise<Blob> {
  const res = await apiFetch(token, '/drive/nodes/archive', {
    method: 'POST',
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
  const res = await apiFetch(token, `/drive/nodes/${nodeId}/content`, { json: false })
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
  const res = await apiFetch(token, `/drive/nodes/${nodeId}/content`, {
    method: 'PUT',
    json: false,
    headers: { 'Content-Type': mimeType },
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
  const res = await apiFetch(token, `/drive/nodes/${nodeId}/content`, {
    method: 'PUT',
    json: false,
    headers: { 'Content-Type': mimeType },
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
  const data = await apiJson<unknown>(token, '/calendar/calendars', { json: false }, 'Calendars')
  return Array.isArray(data) ? (data as UserCalendar[]) : []
}

export async function createUserCalendar(
  token: string,
  payload: { name: string; color_hex?: string }
): Promise<{ id: number; name: string; color_hex: string }> {
  return apiJson<{ id: number; name: string; color_hex: string }>(
    token,
    '/calendar/calendars',
    { method: 'POST', body: JSON.stringify(payload) },
    'Create calendar'
  )
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
  const data = await apiJson<unknown>(token, `/calendar/events${q}`, { json: false }, 'Calendar')
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
  return apiJson<{ id: number; title: string; calendar_id?: number }>(
    token,
    '/calendar/events',
    { method: 'POST', body: JSON.stringify(data) },
    'Create event'
  )
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
  return apiJson<{ id: number }>(
    token,
    `/calendar/events/${eventId}`,
    { method: 'PUT', body: JSON.stringify(patch) },
    'Update event'
  )
}

export async function deleteCalendarEvent(token: string, eventId: number): Promise<void> {
  const res = await apiFetch(token, `/calendar/events/${eventId}`, { method: 'DELETE', json: false })
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
  return apiJson<Note[]>(token, '/notes', { json: false }, 'Notes')
}

export async function createNote(token: string, title: string, content: string): Promise<{ id: number; title: string }> {
  return apiJson<{ id: number; title: string }>(
    token,
    '/notes',
    { method: 'POST', body: JSON.stringify({ title, content }) },
    'Create note'
  )
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
  return apiJson<TaskList[]>(token, '/tasks/lists', { json: false }, 'Task lists')
}

export async function fetchTasks(token: string, listId?: number | null): Promise<Task[]> {
  const path = listId != null ? `/tasks?list_id=${listId}` : '/tasks'
  const data = await apiJson<unknown>(token, path, { json: false }, 'Tasks')
  return Array.isArray(data) ? (data as Task[]) : []
}

export async function createTaskList(token: string, name: string): Promise<{ id: number; name: string }> {
  return apiJson<{ id: number; name: string }>(
    token,
    '/tasks/lists',
    { method: 'POST', body: JSON.stringify({ name }) },
    'Create task list'
  )
}

export async function createTask(
  token: string,
  payload: { title: string; list_id?: number | null; due_at?: string | null; repeat_rule?: string | null }
): Promise<{ id: number; title: string }> {
  return apiJson<{ id: number; title: string }>(
    token,
    '/tasks',
    {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        list_id: payload.list_id ?? undefined,
        due_at: payload.due_at ?? undefined,
        repeat_rule: payload.repeat_rule ?? undefined,
      }),
    },
    'Create task'
  )
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
  return apiJson<ContactResponse[]>(token, '/contacts', { json: false }, 'Contacts')
}

export async function createContact(
  token: string,
  payload: { name?: string; email: string; phone?: string }
): Promise<{ id: number; name: string; email: string }> {
  const res = await apiFetch(token, '/contacts', { method: 'POST', body: JSON.stringify(payload) })
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
  return apiJson<{ id: number }>(
    token,
    `/contacts/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    'Update contact'
  )
}

export async function deleteContact(token: string, id: number): Promise<{ ok: boolean }> {
  return apiJsonOk(
    token,
    `/contacts/${id}`,
    { method: 'DELETE', json: false },
    'Delete contact'
  )
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
  const res = await apiFetch(token, '/contacts/import', {
    method: 'POST',
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
  const res = await apiFetch(token, `/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Update task: ${res.status}`)
}

export async function updateTaskCompleted(token: string, id: number, completed: boolean): Promise<void> {
  await updateTask(token, id, { completed })
}

export async function deleteTask(token: string, id: number): Promise<void> {
  const res = await apiFetch(token, `/tasks/${id}`, { method: 'DELETE', json: false })
  if (!res.ok && res.status !== 204) throw new Error(`Delete task: ${res.status}`)
}
