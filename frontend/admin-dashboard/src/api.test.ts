import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiUrl, fetchTenants, fetchUsers, fetchDashboardStats, fetchVaults, createVault, fetchVaultItems, fetchDomains, createDomain, login, register, refreshAuth, moveDriveNode } from './api'

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('apiUrl', () => {
    it('returns path when base is empty (relative URL)', () => {
      const url = apiUrl('/admin/tenants')
      expect(url).toBe('/admin/tenants')
      expect(apiUrl('admin/tenants')).toBe('/admin/tenants')
    })
    it('returns path for /pass/vaults so request hits API host when base is set', () => {
      expect(apiUrl('/pass/vaults')).toContain('/pass/vaults')
    })
  })

  describe('fetchTenants', () => {
    it('calls GET /admin/tenants with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'T1', domain: 't1.local' }]),
      } as Response)
      await fetchTenants('my-token')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/tenants'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)
      await expect(fetchTenants('x')).rejects.toThrow(/403/)
    })
  })

  describe('fetchUsers', () => {
    it('calls GET /admin/tenants/:id/users with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      await fetchUsers(5, 'token')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/tenants/5/users'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        })
      )
    })
  })

  describe('fetchDashboardStats', () => {
    it('calls GET /admin/stats with Bearer token and returns stats', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active_tenants: 2, total_users: 5, api_calls_today: 100 }),
      } as Response)
      const result = await fetchDashboardStats('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/stats'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(result).toEqual({ active_tenants: 2, total_users: 5, api_calls_today: 100 })
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
      await expect(fetchDashboardStats('x')).rejects.toThrow(/500/)
    })
  })

  describe('fetchVaults', () => {
    it('calls GET /pass/vaults with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'Default', user_id: 1, tenant_id: 1, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchVaults('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
  })

  describe('fetchVaultItems', () => {
    it('calls GET /pass/vaults/:id/items with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, vault_id: 5, ciphertext: 'enc', created_at: '', updated_at: '' }]),
      } as Response)
      await fetchVaultItems('tk', 5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults/5/items'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
      await expect(fetchVaultItems('x', 1)).rejects.toThrow(/404/)
    })
  })

  describe('createVault', () => {
    it('calls POST /pass/vaults with name', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 2, name: 'My Vault' }),
      } as Response)
      await createVault('tk', 'My Vault')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'My Vault' }),
        })
      )
    })
  })

  describe('fetchDomains', () => {
    it('calls GET /mail/domains with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, tenant_id: 1, domain: 'example.com', is_active: true, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchDomains('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/domains'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)
      await expect(fetchDomains('x')).rejects.toThrow(/401/)
    })
  })

  describe('createDomain', () => {
    it('calls POST /mail/domains with domain', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, domain: 'example.com' }),
      } as Response)
      await createDomain('tk', 'example.com')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/domains'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ domain: 'example.com' }),
        })
      )
    })
  })

  describe('login', () => {
    it('calls POST /auth/login with email, password, tenant_id (default 1)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await login({ email: 'a@b.com', password: 'p' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.com', password: 'p', tenant_id: '1' }),
        })
      )
    })
    it('calls with explicit tenant_id when provided', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await login({ email: 'a@b.com', password: 'p', tenant_id: 2 })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ email: 'a@b.com', password: 'p', tenant_id: '2' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid credentials'),
      } as Response)
      await expect(login({ email: 'a@b.com', password: 'p' })).rejects.toThrow()
    })
  })

  describe('register', () => {
    it('calls POST /auth/register with email, password, tenant_id as string', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await register({ email: 'new@b.com', password: 'password123' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'new@b.com', password: 'password123', tenant_id: '1' }),
        })
      )
    })
  })

  describe('refreshAuth', () => {
    it('calls POST /auth/refresh with refresh_token and returns new tokens', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 900 }),
      } as Response)
      const res = await refreshAuth('old_rt')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: 'old_rt' }),
        })
      )
      expect(res).toEqual({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 900 })
    })
  })

  describe('moveDriveNode', () => {
    it('calls PUT /drive/nodes/:id with parent_id for move', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 10, name: 'Doc', parent_id: 5 }),
      } as Response)
      await moveDriveNode('tk', 10, 5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/10'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
          body: JSON.stringify({ parent_id: 5 }),
        })
      )
    })
    it('sends parent_id 0 for move to root', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 10, name: 'Doc', parent_id: null }),
      } as Response)
      await moveDriveNode('tk', 10, null)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ parent_id: 0 }),
        })
      )
    })
  })
})
