const getBaseUrl = (): string => {
  const env = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
  const base = env?.VITE_API_URL ?? ''
  return base ? `${base.replace(/\/$/, '')}` : ''
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
    body: JSON.stringify({ ...body, tenant_id: body.tenant_id ?? 1 }),
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
