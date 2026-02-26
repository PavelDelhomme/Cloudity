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
  if (!res.ok) throw new Error(`Create folder: ${res.status}`)
  return res.json() as Promise<{ id: number; name: string; is_folder: boolean }>
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

export async function deleteDriveNode(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/drive/nodes/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Delete: ${res.status}`)
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

export async function uploadDriveFile(
  token: string,
  parentId: number | null,
  file: File
): Promise<{ id: number; name: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  form.append('name', file.name)
  if (parentId != null) form.append('parent_id', String(parentId))
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)
  try {
    const res = await fetch(apiUrl('/drive/nodes/upload'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text ? `Upload: ${res.status} - ${text}` : `Upload: ${res.status}`)
    }
    return res.json() as Promise<{ id: number; name: string; size: number }>
  } finally {
    clearTimeout(timeoutId)
  }
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

export async function updateTaskCompleted(token: string, id: number, completed: boolean): Promise<void> {
  const res = await fetch(apiUrl(`/tasks/${id}`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  })
  if (!res.ok) throw new Error(`Update task: ${res.status}`)
}
