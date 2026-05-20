import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  apiUrl,
  apiFetch,
  apiJson,
  apiJsonOk,
  fetchTenants,
  fetchTenantsPage,
  fetchUsers,
  fetchUsersPage,
  deleteTenant,
  fetchDashboardStats,
  fetchVaults,
  createVault,
  fetchVaultItems,
  fetchDomains,
  fetchDomainsPage,
  fetchDomainMailboxesPage,
  fetchDomainAliasesPage,
  createDomain,
  login,
  register,
  refreshAuth,
  moveDriveNode,
  createDriveFile,
  createDriveFileWithUniqueName,
  getDriveNodeContentAsText,
  putDriveNodeContent,
  fetchDriveRecentFiles,
  fetchDriveSearch,
  fetchMailAccounts,
  syncMailAccount,
  sendMailMessage,
} from './api'

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('apiUrl', () => {
    it('returns URL that contains the path (relative or absolute)', () => {
      const url = apiUrl('/admin/tenants')
      expect(url).toContain('/admin/tenants')
      expect(apiUrl('admin/tenants')).toContain('/admin/tenants')
    })
    it('returns path for /pass/vaults so request hits API host when base is set', () => {
      expect(apiUrl('/pass/vaults')).toContain('/pass/vaults')
    })
    it('returns path for /photos/timeline (microservice photos via gateway)', () => {
      expect(apiUrl('/photos/timeline')).toContain('/photos/timeline')
    })
  })

  describe('apiFetch', () => {
    it('combines apiUrl + Bearer + JSON content-type by default (no body init)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response)
      await apiFetch('tok', '/admin/foo')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/foo'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer tok',
            'Content-Type': 'application/json',
          }),
        })
      )
    })
    it('omits Content-Type when json:false (e.g. DELETE / blob upload)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({ ok: true } as Response)
      await apiFetch('tok', '/admin/foo', { method: 'DELETE', json: false })
      const call = mockFetch.mock.calls.at(-1)?.[1] as RequestInit
      expect((call.headers as Record<string, string>)['Content-Type']).toBeUndefined()
      expect((call.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
      expect(call.method).toBe('DELETE')
    })
    it('merges custom headers over getAuthHeaders', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response)
      await apiFetch('tok', '/x', { headers: { 'X-Foo': 'bar', Accept: 'image/*' } })
      const call = mockFetch.mock.calls.at(-1)?.[1] as RequestInit
      expect(call.headers).toMatchObject({
        Authorization: 'Bearer tok',
        'X-Foo': 'bar',
        Accept: 'image/*',
      })
    })
    it('omits Authorization when token is empty', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response)
      await apiFetch('', '/auth/login', { method: 'POST', body: '{}' })
      const call = mockFetch.mock.calls.at(-1)?.[1] as RequestInit
      expect((call.headers as Record<string, string>)['Authorization']).toBeUndefined()
    })
  })

  describe('apiJson', () => {
    it('parses JSON when ok', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ a: 1 }) } as Response)
      const out = await apiJson<{ a: number }>('tok', '/x')
      expect(out).toEqual({ a: 1 })
    })
    it('throws "<prefix>: <status>" by default on !ok with non-JSON body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response)
      await expect(apiJson('tok', '/x', undefined, 'Foo')).rejects.toThrow('Foo: 500')
    })
    it('extracts FastAPI `detail` from JSON error body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ detail: 'Cannot delete default tenant' }),
      } as Response)
      await expect(apiJson('tok', '/admin/tenants/1', { method: 'DELETE', json: false })).rejects.toThrow(
        'Cannot delete default tenant'
      )
    })
    it('extracts Go-style `error` field if `detail` is missing', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'invalid credentials' }),
      } as Response)
      await expect(apiJson('tok', '/auth/login')).rejects.toThrow('invalid credentials')
    })
  })

  describe('apiJsonOk', () => {
    it('parses { ok: true } with default generic', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
      const out = await apiJsonOk('tok', '/x/patch', { method: 'PATCH', body: '{}' })
      expect(out).toEqual({ ok: true })
    })
    it('parses extended ok body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, affected: 3 }),
      } as Response)
      const out = await apiJsonOk<{ ok: boolean; affected: number }>('tok', '/mail/rules/apply', {
        method: 'POST',
        json: false,
      })
      expect(out).toEqual({ ok: true, affected: 3 })
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
    it('passes domain_contains when domainContains is set', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      await fetchTenants('t', { skip: 0, limit: 10, domainContains: 'e2e-' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/domain_contains=e2e-/),
        expect.anything()
      )
    })
  })

  describe('fetchTenantsPage', () => {
    it('returns hasMore true when API returns one extra row', async () => {
      const mockFetch = vi.mocked(fetch)
      const rows = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        name: `T${i}`,
        domain: `d${i}.local`,
        database_url: 'x',
        is_active: true,
        config: {},
        created_at: '',
        updated_at: null,
      }))
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rows),
      } as Response)
      const out = await fetchTenantsPage('tok', { skip: 0, pageSize: 5 })
      expect(out.items).toHaveLength(5)
      expect(out.hasMore).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=6'), expect.anything())
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

  describe('fetchUsersPage', () => {
    it('slices to pageSize when hasMore', async () => {
      const users = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        tenant_id: 1,
        email: `u${i}@x.com`,
        is_2fa_enabled: false,
        is_active: true,
        role: 'user',
        last_login: null,
        created_at: '',
        updated_at: null,
      }))
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(users),
      } as Response)
      const out = await fetchUsersPage(1, 't', { skip: 0, pageSize: 3 })
      expect(out.items).toHaveLength(3)
      expect(out.hasMore).toBe(true)
    })

    it('treats a null users response as an empty page', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      } as Response)
      const out = await fetchUsersPage(1, 't', { skip: 0, pageSize: 3 })
      expect(out).toEqual({ items: [], hasMore: false })
    })
  })

  describe('deleteTenant', () => {
    it('calls DELETE /admin/tenants/:id', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response)
      await deleteTenant(42, 'tok')
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/admin/tenants/42'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
    it('throws with server detail when present', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ detail: 'Cannot delete default tenant' }),
      } as Response)
      await expect(deleteTenant(1, 'x')).rejects.toThrow(/Cannot delete default tenant/)
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

  describe('fetchDomainsPage', () => {
    it('requests limit pageSize+1 and sets hasMore', async () => {
      const mockFetch = vi.mocked(fetch)
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        tenant_id: 1,
        domain: `d${i}.com`,
        is_active: true,
        created_at: '',
        updated_at: '',
      }))
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) } as Response)
      const out = await fetchDomainsPage('t', { skip: 0, pageSize: 2 })
      expect(out.items).toHaveLength(2)
      expect(out.hasMore).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=3'), expect.anything())
    })

    it('treats a null domains response as an empty page', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve(null) } as Response)
      const out = await fetchDomainsPage('t', { skip: 0, pageSize: 2 })
      expect(out).toEqual({ items: [], hasMore: false })
    })
  })

  describe('fetchDomainMailboxesPage', () => {
    it('slices and hasMore', async () => {
      const mockFetch = vi.mocked(fetch)
      const rows = [{ id: 1, domain_id: 1, local_part: 'a', quota_mb: 0, is_active: true, created_at: '', updated_at: '' }]
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) } as Response)
      const out = await fetchDomainMailboxesPage('t', 5, { skip: 0, pageSize: 1 })
      expect(out.items).toHaveLength(1)
      expect(out.hasMore).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/mail/domains/5/mailboxes'), expect.anything())
    })

    it('treats a null mailboxes response as an empty page', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve(null) } as Response)
      const out = await fetchDomainMailboxesPage('t', 5, { skip: 0, pageSize: 1 })
      expect(out).toEqual({ items: [], hasMore: false })
    })
  })

  describe('fetchDomainAliasesPage', () => {
    it('slices and hasMore', async () => {
      const mockFetch = vi.mocked(fetch)
      const two = [
        { id: 1, domain_id: 1, source_local: 'a', destination: 'b@c', created_at: '', updated_at: '' },
        { id: 2, domain_id: 1, source_local: 'b', destination: 'c@c', created_at: '', updated_at: '' },
      ]
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(two) } as Response)
      const out = await fetchDomainAliasesPage('t', 1, { skip: 0, pageSize: 1 })
      expect(out.items).toHaveLength(1)
      expect(out.hasMore).toBe(true)
    })

    it('treats a null aliases response as an empty page', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve(null) } as Response)
      const out = await fetchDomainAliasesPage('t', 1, { skip: 0, pageSize: 1 })
      expect(out).toEqual({ items: [], hasMore: false })
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

  describe('createDriveFile', () => {
    it('calls POST /drive/nodes with is_folder false', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 5, name: 'Doc.docx', is_folder: false }),
      } as Response)
      await createDriveFile('tk', null, 'Doc.docx')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
          body: JSON.stringify({ parent_id: null, name: 'Doc.docx', is_folder: false }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400 } as Response)
      await expect(createDriveFile('x', 1, 'a.docx')).rejects.toThrow(/400/)
    })
    it('throws with status 409 when file exists', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response)
      const err = await createDriveFile('x', null, 'Sans titre.docx').catch((e) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error & { status?: number }).status).toBe(409)
    })
  })

  describe('createDriveFileWithUniqueName', () => {
    it('returns result when first name is free (GET list then POST create)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 5, name: 'Doc.docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Doc.docx')
      expect(result.name).toBe('Doc.docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    it('uses "name (1).ext" when base name exists in list', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([{ id: 1, name: 'Sans titre.docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 6, name: 'Sans titre (1).docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Sans titre.docx')
      expect(result.name).toBe('Sans titre (1).docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    it('uses next free index when several numbered names exist', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: 'Sans titre.docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null },
              { id: 2, name: 'Sans titre (1).docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null },
            ]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 7, name: 'Sans titre (2).docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Sans titre.docx')
      expect(result.name).toBe('Sans titre (2).docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('getDriveNodeContentAsText', () => {
    it('calls GET /drive/nodes/:id/content and returns text', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('hello world'),
      } as Response)
      const result = await getDriveNodeContentAsText('tk', 42)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/42/content'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(result).toBe('hello world')
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
      await expect(getDriveNodeContentAsText('x', 1)).rejects.toThrow(/404/)
    })
  })

  describe('fetchDriveRecentFiles', () => {
    it('calls GET /drive/nodes/recent with limit and returns array', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'a.docx', is_folder: false, size: 0, parent_id: null, created_at: '', updated_at: '' }]),
      } as Response)
      const result = await fetchDriveRecentFiles('tk', 15)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/drive\/nodes\/recent\?limit=15/),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('a.docx')
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)
      await expect(fetchDriveRecentFiles('x', 10)).rejects.toThrow(/401/)
    })
  })

  describe('fetchDriveSearch', () => {
    it('calls GET /drive/nodes/search with q and optional limit', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      await fetchDriveSearch('tk', 'notes', { limit: 30 })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/drive\/nodes\/search\?q=notes&limit=30/),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
      await expect(fetchDriveSearch('x', 'a')).rejects.toThrow(/500/)
    })
  })

  describe('putDriveNodeContent', () => {
    it('calls PUT /drive/nodes/:id/content with body and Content-Type', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42, size: 11 }),
      } as Response)
      await putDriveNodeContent('tk', 42, 'hello world', 'text/plain')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/42/content'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer tk',
            'Content-Type': 'text/plain',
          }),
          body: 'hello world',
        })
      )
    })
    it('defaults mimeType to text/plain', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, size: 0 }),
      } as Response)
      await putDriveNodeContent('tk', 1, '')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'text/plain' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)
      await expect(putDriveNodeContent('x', 1, 'x')).rejects.toThrow(/403/)
    })
  })

  describe('fetchMailAccounts', () => {
    it('calls GET /mail/me/accounts with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, email: 'u@example.com', user_id: 1, tenant_id: 1, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchMailAccounts('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/accounts'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tk' }) })
      )
    })
  })

  describe('syncMailAccount', () => {
    it('calls POST /mail/me/accounts/:id/sync with password', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ synced: 5, message: 'synchronisation terminée' }),
      } as Response)
      await syncMailAccount('tk', 1, 'secret')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/accounts/1/sync'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tk', 'Content-Type': 'application/json' }),
        })
      )
      const callBody = JSON.parse((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(callBody.password).toBe('secret')
    })
    it('throws with error message when not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, text: () => Promise.resolve(JSON.stringify({ error: 'identifiants invalides' })) } as Response)
      await expect(syncMailAccount('x', 1, 'p')).rejects.toThrow(/identifiants invalides/)
    })
  })

  describe('sendMailMessage', () => {
    it('calls POST /mail/me/send with account_id, password, to, subject, body', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'message envoyé' }),
      } as Response)
      await sendMailMessage('tk', {
        account_id: 1,
        password: 'pass',
        to: 'dest@example.com',
        subject: 'Test',
        body: 'Hello',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/send'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            account_id: 1,
            password: 'pass',
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
          }),
        })
      )
    })
  })
})
