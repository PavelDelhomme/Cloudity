import { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY, getAuthHeaders, apiFetch, apiJson, apiJsonOk } from '@cloudity/shared'

export { apiUrl, getApiBaseUrl, AUTH_STORAGE_KEY, getAuthHeaders, apiFetch, apiJson, apiJsonOk }

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
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

export async function fetchTenants(
  token: string,
  options?: { skip?: number; limit?: number; domainContains?: string }
): Promise<TenantResponse[]> {
  const params = new URLSearchParams()
  if (options?.skip != null && options.skip >= 0) params.set('skip', String(options.skip))
  if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
  if (options?.domainContains?.trim()) params.set('domain_contains', options.domainContains.trim())
  const path = `/admin/tenants${params.toString() ? `?${params.toString()}` : ''}`
  return asArray(await apiJson<TenantResponse[] | null>(token, path, undefined, 'Tenants'))
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
  return asArray(await apiJson<UserResponse[] | null>(token, path, undefined, 'Users'))
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

export type TenantMailAccountSummary = {
  id: number
  user_id: number
  email: string
  label: string | null
  alias_count: number
  created_at: string
}

export async function fetchTenantMailAccounts(
  tenantId: number,
  token: string
): Promise<TenantMailAccountSummary[]> {
  return asArray(
    await apiJson<TenantMailAccountSummary[] | null>(
      token,
      `/admin/tenants/${tenantId}/mail-accounts`,
      undefined,
      'Mail accounts'
    )
  )
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

export type AdminTwoFAResetPayload = {
  admin_totp_code: string
  reason?: string
}

export type AdminTwoFAResetResponse = {
  ok: boolean
  user_id: number
  email: string
  is_2fa_enabled: boolean
  message: string
}

/** U9 — réinitialise la 2FA d'un utilisateur (step-up TOTP admin + audit côté serveur). */
export async function adminResetUser2FA(
  userId: number,
  payload: AdminTwoFAResetPayload,
  token: string
): Promise<AdminTwoFAResetResponse> {
  return apiJson<AdminTwoFAResetResponse>(
    token,
    `/admin/users/${userId}/2fa/reset`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Admin 2FA reset'
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

/** Pilotage projet (board type JobbingTrack) — /4dm1n/pilotage */
export type PilotageTaskStatus =
  | 'open'
  | 'in_progress'
  | 'waiting'
  | 'partial'
  | 'to_validate'
  | 'ok'
  | 'recheck'
  | 'rework'
  | 'ko'
  | 'tested'
  | 'to_test_prod'
  | 'prod_ok'
  | 'done'
  | 'blocked'
  | 'deferred'

export type PilotageChecklistItem = {
  id: string
  label: string
  done: boolean
  note?: string
}

export type PilotageLogSnippet = {
  at: string
  source: string
  text: string
}

export type PilotageSurface = {
  done: boolean
  label?: string
}

export type PilotageTask = {
  id: string
  cycleId?: string | null
  section: string
  label: string
  description: string
  expected: string
  status: PilotageTaskStatus
  order: number
  kind?: 'task' | 'problem' | 'gate' | string
  parentId?: string | null
  blockedBy?: string[]
  logSnippets?: PilotageLogSnippet[]
  howToSteps?: { title: string; body: string }[]
  docLinks?: string[]
  checklist: PilotageChecklistItem[]
  surfaces?: Record<string, PilotageSurface>
  completionNote?: string
  porteurNote: string
  history: { at: string; action: string; note?: string | null }[]
}

export type PilotageInboxItem = {
  id: string
  at: string
  kind: string
  text: string
  linkedTaskId?: string | null
  promoted?: boolean
}

export type PilotageRelease = {
  id: string
  label: string
  status: string
  summary?: string
  features?: string[]
  note?: string
}

export type PilotageCycleView = {
  id: string
  label: string
  description?: string
  itemIds: string[]
  status: string
  okCount: number
  total: number
  progressLabel: string
}

export type PilotageBoard = {
  version: number
  updatedAt: string
  cycles: { id: string; label: string; description?: string; itemIds: string[] }[]
  tasks: Record<string, PilotageTask>
  cycleViews?: PilotageCycleView[]
  counts?: Record<string, number>
  active?: {
    id: string
    label: string
    status: string
    kind?: string
    parentId?: string
    statusLabel?: string
  } | null
  blockedHint?: {
    taskId: string
    label: string
    blockedBy: { id: string; label: string }[]
    resumeHint: string
  } | null
  openProblems?: { id: string; label: string; parentId?: string; status: string }[]
  preprodProgress?: { okCount: number; total: number; progressLabel: string }
  recentDone?: { id: string; label: string; status: string }[]
  inbox?: PilotageInboxItem[]
  releases?: PilotageRelease[]
  focusTaskId?: string | null
  decisionsCatalog?: { status: string; decision: string; label: string; group: string }[]
  toValidate?: { id: string; label: string; status: string }[]
}

export type PilotageBoardResponse = {
  success: boolean
  storageReady?: boolean
  interactive?: boolean
  canWrite?: boolean
  runtimeEnv?: string
  message?: string
  board: PilotageBoard
}

export type PilotageDecisionCode =
  | 'A_FAIRE'
  | 'EN_COURS'
  | 'EN_ATTENTE'
  | 'PARTIEL'
  | 'A_VALIDER'
  | 'OK'
  | 'A_REVERIFIER'
  | 'A_CORRIGER'
  | 'KO'
  | 'TESTEE'
  | 'A_TESTER_PROD'
  | 'PROD_OK'
  | 'TERMINEE'
  | 'BLOQUE'
  | 'PLUS_TARD'
  | 'REWORK'
  | string

export type PilotageActionPayload = {
  type:
    | 'decide'
    | 'checklist'
    | 'checklist_bulk'
    | 'note'
    | 'reorder'
    | 'move'
    | 'create'
    | 'report_problem'
    | 'resolve_problem'
    | 'inbox_note'
    | 'promote_inbox'
    | 'attach_log'
    | 'set_focus'
    | 'release_status'
    | 'surface'
  itemId: string
  decision?: PilotageDecisionCode
  note?: string
  checklistItemId?: string
  checklistItemIds?: string[]
  done?: boolean
  direction?: 'up' | 'down'
  cycleId?: string | null
  label?: string
  description?: string
  expected?: string
  section?: string
  checklistLabels?: string[]
  parentId?: string
  problemId?: string
  logText?: string
  logSource?: string
  inboxId?: string
  kind?: string
  releaseId?: string
  status?: string
  surfaceKey?: string
}

export type PilotageOpsSignals = {
  success: boolean
  available: boolean
  notes?: string[]
  hint?: string
  containers: {
    service: string
    container?: string | null
    ok: boolean
    lines?: string[]
    errors?: string[]
    error?: string
  }[]
  mobileCrashes?: {
    id: string
    filename: string
    modified: string
    sizeBytes: number
  }[]
  mobileCrashesDir?: string | null
}

export async function fetchPilotageBoard(token: string): Promise<PilotageBoardResponse> {
  return apiJson<PilotageBoardResponse>(token, '/admin/pilotage/board', undefined, 'Pilotage board')
}

export async function postPilotageAction(
  token: string,
  body: PilotageActionPayload
): Promise<PilotageBoardResponse & { message?: string }> {
  return apiJson<PilotageBoardResponse & { message?: string }>(
    token,
    '/admin/pilotage/board/action',
    { method: 'POST', body: JSON.stringify(body) },
    'Pilotage action'
  )
}

export async function syncPilotageDocs(token: string): Promise<PilotageBoardResponse & { message?: string }> {
  return apiJson<PilotageBoardResponse & { message?: string }>(
    token,
    '/admin/pilotage/board/sync-docs',
    { method: 'POST', body: '{}' },
    'Pilotage sync docs'
  )
}

export async function fetchPilotageOpsSignals(token: string): Promise<PilotageOpsSignals> {
  return apiJson<PilotageOpsSignals>(
    token,
    '/admin/pilotage/ops-signals?tail=80',
    undefined,
    'Pilotage ops signals'
  )
}

export async function fetchPilotageMobileCrashDetail(
  token: string,
  crashId: string
): Promise<{ success: boolean; crash: Record<string, unknown> }> {
  return apiJson(
    token,
    `/admin/pilotage/mobile-crashes/${encodeURIComponent(crashId)}`,
    undefined,
    'Pilotage mobile crash'
  )
}

/** Rapport CVE/OSV (admin) — source api.osv.dev, cache optionnel côté admin-service. */
export type CveVulnEntryResponse = {
  osv_id: string
  summary?: string | null
  details?: string | null
  modified?: string | null
  aliases: string[]
  cve_aliases: string[]
  severity?: string | null
  fixed_versions: string[]
  affected_ranges: string[]
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
  manifests?: Record<string, number>
  ecosystem_package_counts?: Record<string, number>
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

// Pass / Vaults (passwords-service)
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

/** Supprime un coffre et tous ses items (cascade côté Postgres). */
export async function deleteVault(token: string, vaultId: number): Promise<void> {
  const res = await apiFetch(token, `/pass/vaults/${vaultId}`, { method: 'DELETE', json: false })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Delete vault: ${res.status}`)
  }
}

export async function fetchVaultItems(token: string, vaultId: number): Promise<PassItemResponse[]> {
  return apiJson<PassItemResponse[]>(token, `/pass/vaults/${vaultId}/items`, undefined, 'Vault items')
}

/**
 * Crée un item dans un vault. Le `ciphertext` est une chaîne base64url
 * d'enveloppe `EnvelopeV1` (cf. `@cloudity/pass-crypto`). Le serveur
 * ne lit jamais ce blob — il ne fait qu'enregistrer + tagger `format_version`.
 */
export async function createVaultItem(
  token: string,
  vaultId: number,
  ciphertext: string,
  formatVersion = 1
): Promise<PassItemResponse> {
  return apiJson<PassItemResponse>(
    token,
    `/pass/vaults/${vaultId}/items`,
    {
      method: 'POST',
      body: JSON.stringify({ ciphertext, format_version: formatVersion }),
    },
    'Create vault item'
  )
}

/** Met à jour un item existant — ciphertext entièrement réécrit côté client. */
export async function updateVaultItem(
  token: string,
  itemId: number,
  ciphertext: string,
  formatVersion = 1
): Promise<PassItemResponse> {
  return apiJson<PassItemResponse>(
    token,
    `/pass/items/${itemId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ ciphertext, format_version: formatVersion }),
    },
    'Update vault item'
  )
}

/** Supprime un item (RLS garantit que l'user ne voit que les siens). */
export async function deleteVaultItem(token: string, itemId: number): Promise<void> {
  const res = await apiFetch(token, `/pass/items/${itemId}`, { method: 'DELETE', json: false })
  if (!res.ok) {
    throw new Error(`Delete vault item: ${res.status}`)
  }
}

// Mail / Domaines (mail-directory-service)
export type MailDomainResponse = {
  id: number
  tenant_id: number
  domain: string
  is_active: boolean
  role?: 'standard' | 'alias' | string
  mta_enabled?: boolean
  mta_provider?: string
  mta_hostname?: string
  mx_target?: string
  spf_policy?: string
  dkim_selector?: string
  dmarc_policy?: 'none' | 'quarantine' | 'reject' | string
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
  return asArray(await apiJson<MailDomainResponse[] | null>(token, path, undefined, 'Domains'))
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
  patch: {
    is_active?: boolean
    role?: 'standard' | 'alias' | string
    mta_enabled?: boolean
    mta_provider?: string
    mta_hostname?: string
    mx_target?: string
    spf_policy?: string
    dkim_selector?: string
    dmarc_policy?: 'none' | 'quarantine' | 'reject' | string
  }
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
  return asArray(await apiJson<MailboxResponse[] | null>(token, path, undefined, 'Mailboxes'))
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
  return asArray(await apiJson<DomainAliasResponse[] | null>(token, path, undefined, 'Aliases'))
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


// Mail utilisateur — voir ./apiMail.ts (FE-SPLIT-01)
export * from './apiMail'


export type LoginBody = { email: string; password: string; tenant_id?: number }
export type LoginResponse = {
  access_token: string
  refresh_token?: string
  requires_2fa?: boolean
  user_id?: string
}

/** Réponse de `/auth/2fa/verify`. Si on vient d'activer la 2FA pour la 1ère fois, le serveur inclut `recovery_codes` (à montrer UNE fois). */
export type Verify2FAResponse = {
  access_token: string
  refresh_token?: string
  user_id: string
  expires_in: number
  used_recovery_code: boolean
  recovery_codes?: string[]
  recovery_codes_warning?: string
}

/** Active la 2FA TOTP : retourne le secret + URL otpauth pour QR. UI doit ensuite appeler `verify2FA` avec le 1er code. */
export async function enable2FA(token: string): Promise<{ secret: string; url: string; message: string }> {
  const res = await apiFetch(null, '/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ access_token: token }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(parseApiErrorMessage(t, `Activation 2FA impossible (${res.status})`))
  }
  return res.json()
}

/** Vérifie le code TOTP (ou recovery code en login étape 2). Si 1ère activation, renvoie aussi 10 `recovery_codes`. */
export async function verify2FA(body: {
  email: string
  tenant_id?: number
  code: string
}): Promise<Verify2FAResponse> {
  const res = await apiFetch(null, '/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ ...body, tenant_id: String(body.tenant_id ?? 1) }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(parseApiErrorMessage(t, `Vérification 2FA impossible (${res.status})`))
  }
  return res.json()
}

/** Régénère 10 nouveaux codes de récupération (invalide les anciens). À montrer UNE fois. */
export async function regenerateRecoveryCodes(token: string): Promise<{ codes: string[]; count: number; warning: string }> {
  return apiJson(token, '/auth/2fa/recovery-codes/regenerate', { method: 'POST' }, 'Codes de récupération')
}

/** Compte des codes de récupération encore utilisables. UI : warning si <=2. */
export async function countRecoveryCodes(token: string): Promise<{ active: number; is_2fa_enabled: boolean }> {
  return apiJson(token, '/auth/2fa/recovery-codes/count', undefined, 'Codes de récupération (count)')
}

/**
 * Réponse de `GET /auth/security-paths` (cf. backend `securetoken.go`).
 *
 * Pour chaque page sensible (`settings_security`, …), le serveur émet :
 *  - `path` : chemin SPA rotatif (HMAC du `(user_id, purpose, epoch 30 j)`),
 *  - `token` : token brut (le SPA peut l'utiliser pour ses redirects),
 *  - `expires_at` : timestamp ISO-8601 UTC où le token est rejeté
 *    (sliding window : window précédent toléré, donc en pratique
 *    `now + 2 × window`),
 *  - `rotates_at` : timestamp ISO-8601 UTC de la prochaine rotation.
 *
 * Modèle d'usage : on cache la réponse 1 h via React Query, et on
 * re-fetche à `rotates_at - 5 min` pour ne pas attendre l'erreur.
 */
export interface SecurePathEntry {
  readonly path: string
  readonly token: string
  readonly expires_at: string
  readonly rotates_at: string
}

export interface SecurePathsResponse {
  readonly paths: Record<string, SecurePathEntry>
  readonly issued_at: string
  readonly window_seconds: number
}

/** Récupère les chemins SPA rotatifs (Bearer obligatoire). */
export async function fetchSecurePaths(token: string): Promise<SecurePathsResponse> {
  return apiJson<SecurePathsResponse>(token, '/auth/security-paths', undefined, 'Chemins sécurisés')
}

/**
 * Valide un token capability côté serveur. Renvoie `true` si OK, `false`
 * si expiré / signature invalide / purpose inconnu / user mismatch.
 *
 * Ne lève pas d'exception sur 403 (cas attendu = token périmé) — seules
 * les erreurs réseau / 5xx remontent.
 */
export async function validateSecurePath(
  token: string,
  pathToken: string,
  purpose: string,
): Promise<boolean> {
  const res = await apiFetch(token, '/auth/security-paths/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pathToken, purpose }),
  })
  if (res.status === 200) return true
  if (res.status === 401 || res.status === 403) return false
  throw new Error(`Validation chemin sécurisé : HTTP ${res.status}`)
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

export type UserPreferencesApiResponse = {
  preferences: Record<string, unknown>
  updated_at?: string
}

export async function fetchUserPreferences(token: string): Promise<UserPreferencesApiResponse> {
  return apiJson(token, '/auth/me/preferences', undefined, 'Préférences utilisateur')
}

export async function updateUserPreferences(
  token: string,
  preferences: Record<string, unknown>
): Promise<UserPreferencesApiResponse> {
  return apiJson(
    token,
    '/auth/me/preferences',
    { method: 'PUT', body: JSON.stringify({ preferences }) },
    'Préférences utilisateur'
  )
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
  taken_at?: string | null
  created_at: string
  updated_at: string
  /** Nombre d'éléments au 1er niveau (dossiers uniquement, renvoyé par l'API). */
  child_count?: number
  child_folders?: number
  child_files?: number
  /** Date de suppression (corbeille). */
  deleted_at?: string | null
  /** Archivage Photos (hors timeline). */
  photo_archived_at?: string | null
  /** Verrouillage Photos (hors timeline et archive). */
  photo_locked_at?: string | null
  /** Contenu fichier chiffré côté client (blob opaque serveur). */
  vault_encrypted?: boolean
  /** Dossier coffre serveur (fichiers descendants chiffrés). */
  is_vault_folder?: boolean
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

export type DriveStorageServiceUsage = {
  label: string
  bytes: number
  file_count: number
}

export type DriveStorageSummary = {
  photos: DriveStorageServiceUsage
  drive: DriveStorageServiceUsage
  mail?: DriveStorageServiceUsage | null
  note?: string
}

export async function fetchDriveStorageSummary(token: string): Promise<DriveStorageSummary> {
  return apiJson<DriveStorageSummary>(
    token,
    '/drive/storage/summary',
    { json: false },
    'Quota stockage Drive'
  )
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

export async function fetchDrivePhotosArchive(token: string): Promise<DriveNode[]> {
  return apiJson<DriveNode[]>(token, '/drive/photos/archive', { json: false }, 'Photos archive')
}

export async function fetchDrivePhotosLocked(token: string): Promise<DriveNode[]> {
  return apiJson<DriveNode[]>(token, '/drive/photos/locked', { json: false }, 'Photos locked')
}

async function mutateDrivePhotosIds(
  token: string,
  path: string,
  ids: number[],
  label: string
): Promise<{ updated: number }> {
  const res = await apiFetch(token, path, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    let msg = `${label}: ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<{ updated: number }>
}

export function archiveDrivePhotos(token: string, ids: number[]): Promise<{ updated: number }> {
  return mutateDrivePhotosIds(token, '/drive/photos/archive', ids, 'Archivage photos')
}

export function unarchiveDrivePhotos(token: string, ids: number[]): Promise<{ updated: number }> {
  return mutateDrivePhotosIds(token, '/drive/photos/unarchive', ids, 'Restauration archive photos')
}

export function lockDrivePhotos(token: string, ids: number[]): Promise<{ updated: number }> {
  return mutateDrivePhotosIds(token, '/drive/photos/lock', ids, 'Verrouillage photos')
}

export function unlockDrivePhotos(token: string, ids: number[]): Promise<{ updated: number }> {
  return mutateDrivePhotosIds(token, '/drive/photos/unlock', ids, 'Déverrouillage photos')
}

export async function createDriveFolder(
  token: string,
  parentId: number | null,
  name: string,
  opts?: { isVaultFolder?: boolean }
): Promise<{ id: number; name: string; is_folder: boolean }> {
  const res = await apiFetch(token, '/drive/nodes', {
    method: 'POST',
    body: JSON.stringify({
      parent_id: parentId,
      name,
      is_folder: true,
      is_vault_folder: Boolean(opts?.isVaultFolder),
    }),
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

export async function downloadDriveThumbnail(
  token: string,
  nodeId: number,
  size = 360
): Promise<Blob> {
  const res = await apiFetch(token, `/drive/nodes/${nodeId}/thumbnail?size=${encodeURIComponent(String(size))}`, {
    json: false,
  })
  if (!res.ok) throw new Error(`Thumbnail: ${res.status}`)
  const blob = await res.blob()
  const hdr = res.headers.get('Content-Type')?.split(';')[0]?.trim()
  if (hdr && (!blob.type || blob.type === 'application/octet-stream')) {
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
  vault_encrypted?: boolean
  vault_ciphertext?: string | null
  created_at: string
  updated_at: string
}

export async function fetchNotes(token: string): Promise<Note[]> {
  return apiJson<Note[]>(token, '/notes', { json: false }, 'Notes')
}

export async function createNote(
  token: string,
  payload: {
    title: string
    content: string
    vault_encrypted?: boolean
    vault_ciphertext?: string
  }
): Promise<{ id: number; title: string }> {
  return apiJson<{ id: number; title: string }>(
    token,
    '/notes',
    { method: 'POST', body: JSON.stringify(payload) },
    'Create note'
  )
}

export async function updateNote(
  token: string,
  id: number,
  payload: {
    title: string
    content: string
    vault_encrypted?: boolean
    vault_ciphertext?: string
  }
): Promise<{ id: number }> {
  return apiJson<{ id: number }>(
    token,
    `/notes/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    'Update note'
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
  parent_id?: number | null
  title: string
  notes?: string
  completed: boolean
  starred?: boolean
  start_at?: string | null
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
  payload: {
    title: string
    list_id?: number | null
    parent_id?: number | null
    notes?: string | null
    start_at?: string | null
    due_at?: string | null
    repeat_rule?: string | null
    starred?: boolean
  }
): Promise<{ id: number; title: string }> {
  return apiJson<{ id: number; title: string }>(
    token,
    '/tasks',
    {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        list_id: payload.list_id ?? undefined,
        parent_id: payload.parent_id ?? undefined,
        notes: payload.notes ?? undefined,
        start_at: payload.start_at ?? undefined,
        due_at: payload.due_at ?? undefined,
        repeat_rule: payload.repeat_rule ?? undefined,
        starred: payload.starred ?? undefined,
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
  profile?: import('./lib/contactProfile').ContactProfile
  vault_encrypted?: boolean
  vault_ciphertext?: string | null
  created_at: string
  updated_at: string
}

export async function fetchContacts(token: string): Promise<ContactResponse[]> {
  return apiJson<ContactResponse[]>(token, '/contacts', { json: false }, 'Contacts')
}

export async function createContact(
  token: string,
  payload: {
    name?: string
    email?: string
    phone?: string
    profile?: import('./lib/contactProfile').ContactProfile
    vault_encrypted?: boolean
    vault_ciphertext?: string
  }
): Promise<{ id: number; name: string; email: string }> {
  const res = await apiFetch(token, '/contacts', { method: 'POST', body: JSON.stringify(payload) })
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { error?: string }
      throw new Error(j.error || t)
    } catch (e) {
      if (e instanceof Error && e.message && !e.message.startsWith('{')) throw e
      throw new Error(t || `Create contact: ${res.status}`)
    }
  }
  return res.json() as Promise<{ id: number; name: string; email: string }>
}

export async function updateContact(
  token: string,
  id: number,
  payload: {
    name?: string
    email?: string
    phone?: string
    profile?: import('./lib/contactProfile').ContactProfile
    vault_encrypted?: boolean
    vault_ciphertext?: string
  }
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
  patch: Partial<{
    title: string
    notes: string
    completed: boolean
    starred: boolean
    start_at: string | null
    due_at: string | null
    repeat_rule: string | null
    parent_id: number | null
  }>
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.notes !== undefined) body.notes = patch.notes
  if (patch.completed !== undefined) body.completed = patch.completed
  if (patch.starred !== undefined) body.starred = patch.starred
  if (patch.start_at !== undefined) body.start_at = patch.start_at === null ? '' : patch.start_at
  if (patch.due_at !== undefined) body.due_at = patch.due_at === null ? '' : patch.due_at
  if (patch.repeat_rule !== undefined) body.repeat_rule = patch.repeat_rule === null ? '' : patch.repeat_rule
  if (patch.parent_id !== undefined) body.parent_id = patch.parent_id === null ? 0 : patch.parent_id
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

/** Rapport crash mobile (liste back-office admin). */
export type MobileCrashListItem = {
  id: string
  filename: string
  modified: string
  sizeBytes: number
}

export async function fetchMobileCrashList(
  token?: string | null
): Promise<{ items: MobileCrashListItem[] }> {
  const res = await apiFetch(token ?? null, '/mobile/crashes')
  if (!res.ok) throw new Error(`Logs mobile: ${res.status}`)
  return res.json() as Promise<{ items: MobileCrashListItem[] }>
}

export async function fetchMobileCrashDetail(
  id: string,
  token?: string | null
): Promise<Record<string, unknown>> {
  const res = await apiFetch(token ?? null, `/mobile/crashes/detail?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Détail crash: ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}
